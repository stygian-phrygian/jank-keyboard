// "enum" for arpeggiator modes
const ArpeggiatorMode = {
    OFF: 0,
    UP: 1,
    DOWN: 2,
    UP_DOWN: 3,
    ORDER: 4,
    REVERSE: 5,
    RANDOM: 6,
    RANDOM_2: 7,
    UP_2: 8,
    DOWN_2: 9,
}

// "enum" for time divisions
//  with carefully chosen values to simplify arpeggiator time division calculation
const TimeDivision = {

    // 4/4 time signature

    // 16 steps
    WHOLE_NOTE: 1.0 / 4.0,
    // 12 steps
    HALF_NOTE_DOTTED: 1.0 / 3.0,
    // 8 steps
    HALF_NOTE: 1.0 / 2.0,
    // 6 steps
    QUARTER_NOTE_DOTTED: 2.0 / 3.0,
    // 4 steps
    QUARTER_NOTE: 1.0,
    // 3 steps
    EIGHTH_NOTE_DOTTED: 4.0 / 3.0,
    // 2 steps
    EIGHTH_NOTE: 2.0,
    // 1.5 step
    SIXTEENTH_NOTE_DOTTED: 8.0 / 3.0,
    // 1 step
    SIXTEENTH_NOTE: 4.0,
    // 0.5 step
    THIRTY_SECOND_NOTE: 8.0,
};

// struct of note data, non-specific to whether it's a note on or off
class Note {
    constructor(pitch = 60, velocity = 96, channel = 0) {
        // clamp midi values
        pitch = Math.floor(Math.max(0, Math.min(pitch, 127)));
        velocity = Math.floor(Math.max(0, Math.min(velocity, 127)));
        channel = Math.floor(Math.max(0, Math.min(channel, 15)));
        this.pitch = pitch;
        this.velocity = velocity;
        this.channel = channel;
    }
    // --------------------------------------------------------------- private

    // converts a midi note object {pitch, velocity, channel} to either
    // a note on or off (as specified in argument) array of midi bytes
    toMidiBytesArray(isNoteOn) {
        // create status byte
        let statusByte = (isNoteOn ? 0b10010000 : 0b10000000) | this.channel;
        // and return the midi bytes array
        return [statusByte, this.pitch, this.velocity];
    }

    // ---------------------------------------------------------------- public

    toNoteOnMidiBytesArray() {
        return this.toMidiBytesArray(true);
    }

    toNoteOffMidiBytesArray() {
        return this.toMidiBytesArray(false);
    }

    equals(other) {
        return (this.pitch === other.pitch) && (this.channel == other.channel);
    }

    // copy this note to a new object
    copySelf() {
        return new Note(this.pitch, this.velocity, this.channel);
    }
}

// represents stream of note on/off events for a (single) midi pitch/channel
// if duration in milliseconds <= 0, then you'll need to explicitly release()
// the note event to send the requisite note off(s).
class NoteEvent {
    constructor(note, durationInMilliseconds = 0, delayRepeats = 0,
        delayTimeInMilliseconds = 500, midiOutput) {
        // copy the note
        this.note = note.copySelf();
        // where to send the midi bytes
        this.midiOutput = midiOutput;
        // <= 0 : unlimited duration note on (needs a note off later to stop it)
        // >  0 : limited duration note on/off pair
        this.durationInMilliseconds = durationInMilliseconds;
        // number of delay repeats and delay time
        this.delayRepeats = delayRepeats;
        this.delayTimeInMilliseconds = delayTimeInMilliseconds;
        // the number of attacks/releases so we don't send unbalanced messages
        // releases must always be <=  attacks
        this.attacks = 0;
        this.releases = 0;
    }
    // --------------------------------------------------------------- private

    // sends the midi bytes out after delay
    // NOTA BENE this only works on midi byte arrays of length 3 that is,
    // midi note on and note off messages.  It will blow up otherwise.
    sendThroughDelay(midiBytesArray) {
        // there's a chance that the engine changes its internal reference to
        // the midi output, in which case our timeouts will send notes to the
        // wrong midi output incurring sticky notes, so we fetch a reference to
        // it now
        let midiOutput = this.midiOutput;
        // for the number of repeats, set a timeout to trigger our events
        // with decaying velocity (to simulate a delay effect)
        for (let i = 1; i <= this.delayRepeats; ++i) {
            setTimeout(() => {
                let [statusByte, pitch, velocity] = midiBytesArray;
                let reductionFactor = i / (this.delayRepeats + 1);
                // make sure velocity is at least 1, this way we can avoid
                // sending a note off event through a note on with 0 velocity
                let reducedVelocity = Math.max(1, velocity -
                    Math.floor(velocity * reductionFactor));
                midiOutput.send([statusByte, pitch, reducedVelocity]);
            }, i * this.delayTimeInMilliseconds);
        }
    }

    // ---------------------------------------------------------------- public

    // triggers note on event stream
    attack() {
        let noteOnMidiBytesArray = this.note.toNoteOnMidiBytesArray();
        if (this.durationInMilliseconds <= 0) {
            // if duration isn't specified
            // send the note on midi bytes
            this.midiOutput.send(noteOnMidiBytesArray);
            this.sendThroughDelay(noteOnMidiBytesArray);
        } else {
            // else a duration is specified
            // send the note on midi bytes &
            // after a timeout the note off midi bytes
            this.midiOutput.send(noteOnMidiBytesArray);
            this.sendThroughDelay(noteOnMidiBytesArray);
            setTimeout(() => {
                if (this.releases < this.attacks) {
                    this.release();
                }
            }, this.durationInMilliseconds);
        }
        this.attacks += 1;
    }

    // triggers note off event stream
    release() {
        if (this.releases < this.attacks) {
            let noteOffMidiBytesArray = this.note.toNoteOffMidiBytesArray();
            this.midiOutput.send(noteOffMidiBytesArray);
            this.sendThroughDelay(noteOffMidiBytesArray);
            this.releases += 1;
        }
    }

    // gets a (copied) note struct object {pitch, velocity, channel}
    getNote() {
        return this.note.copySelf();
    }

}

// an engine which triggers midi events on some MIDIOutput device and channel
// it has built in note effects:
//     arpeggiation and delay (which run in that order)
class Engine {

    constructor(midiOutput) {
        // where to send midi data
        this.midiOutput = midiOutput;
        // which note events are active (currently pressed)
        this.noteEvents = [];
        // BPM (used for synchronizing the arpeggiator / delay)
        this.BPM = 120;
        // arpeggiator mode
        this.arpeggiatorMode = ArpeggiatorMode.OFF;
        // sequence of notes the arpeggiator rolls through
        this.arpeggiatorNoteSequence = [];
        // which index in our arpeggiator note sequence is playing
        this.arpeggiatorNoteSequenceIndex = 0;
        // gate time for the arpeggiator
        this.arpeggiatorGateTimeInMilliseconds = 0.5 *
            this.calculateDurationInMilliseconds(TimeDivision.SIXTEENTH_NOTE, this.BPM);
        // ticker to trigger arpeggiator
        this.arpeggiatorTicker = new Ticker(
            this.calculateTickRate(
                TimeDivision.SIXTEENTH_NOTE, this.BPM)); // when to arpeggiate notes
        this.arpeggiatorTicker.setCallback(this.arpeggiatorTick.bind(this));
        // how many delay repeats
        this.delayRepeats = 0;
        // how much delay time
        this.delayTimeInMilliseconds = this.calculateDurationInMilliseconds(
            TimeDivision.QUARTER_NOTE_DOTTED, this.BPM);
        // finally set a dummy logging callback until it is set by enduser
        this.loggingCallback = () => {};
    }

    // --------------------------------------------------------------- private

    // returns the rate (in hz) of a BPM divided by a time division (assumes 4/4 time)
    calculateTickRate(timeDivision, BPM) {
        let beatsPerSecond = BPM / 60.0;
        return beatsPerSecond * timeDivision;
    }
    // returns the duration (in milliseconds) of a time division at a BPM (assumes 4/4 time)
    calculateDurationInMilliseconds(timeDivision, BPM) {
        return 1000 / this.calculateTickRate(timeDivision, BPM);
    }

    // callback which runs with each tick of the arpeggiator to fire notes
    arpeggiatorTick() {
        // acquire which note to fire
        if ((this.arpeggiatorMode === ArpeggiatorMode.RANDOM) ||
            (this.arpeggiatorMode === ArpeggiatorMode.RANDOM_2)) {
            this.arpeggiatorNoteSequenceIndex =
                Math.floor(Math.random() * this.arpeggiatorNoteSequence.length);
        } else {
            this.arpeggiatorNoteSequenceIndex =
                (this.arpeggiatorNoteSequenceIndex + 1) %
                this.arpeggiatorNoteSequence.length;
        }
        let note = this.arpeggiatorNoteSequence[this.arpeggiatorNoteSequenceIndex];
        // acquire how long to fire it
        let durationInMilliseconds = this.arpeggiatorGateTimeInMilliseconds;
        // fire it (will release automatically because duration specified)
        let arpeggiatorNoteEvent = new NoteEvent(note, durationInMilliseconds,
            this.delayRepeats, this.delayTimeInMilliseconds, this.midiOutput);
        arpeggiatorNoteEvent.attack();
    }

    // updates the arpeggiator sequence according to
    // the provided arpeggiator mode and existing note events
    updateArpeggiatorSequence() {
        // get the notes which are active from the engine's note events
        let arpeggiatorNoteSequence = [];
        for (let i = 0; i < this.noteEvents.length; ++i) {
            arpeggiatorNoteSequence.push(this.noteEvents[i].getNote());
        }
        let s = []; // temporary sequence variable (sometimes) used below

        switch (this.arpeggiatorMode) {
            case ArpeggiatorMode.OFF:
                // do nothing
                break;
            case ArpeggiatorMode.UP:
                arpeggiatorNoteSequence.sort((noteA, noteB) => noteA.pitch - noteB.pitch);
                break;
            case ArpeggiatorMode.DOWN:
                arpeggiatorNoteSequence.sort((noteA, noteB) => noteB.pitch - noteA.pitch);
                break;
            case ArpeggiatorMode.UP_DOWN:
                arpeggiatorNoteSequence.sort((noteA, noteB) => noteA.pitch - noteB.pitch);
                arpeggiatorNoteSequence.forEach(note => s.push(note.copySelf()));
                s.pop();
                s.reverse();
                s.pop();
                arpeggiatorNoteSequence.push(...s);
                break;
            case ArpeggiatorMode.ORDER:
                // do nothing
                break;
            case ArpeggiatorMode.REVERSE:
                arpeggiatorNoteSequence.reverse();
                break;
            case ArpeggiatorMode.RANDOM:
                // do nothing
                break;
            case ArpeggiatorMode.RANDOM_2:
                arpeggiatorNoteSequence.forEach(note => s.push(note.copySelf()));
                s.forEach(note => note.pitch += 12);
                arpeggiatorNoteSequence.push(...s);
                break;
            case ArpeggiatorMode.UP_2:
                arpeggiatorNoteSequence.forEach(note => s.push(note.copySelf()));
                s.forEach(note => note.pitch += 12);
                arpeggiatorNoteSequence.push(...s);
                arpeggiatorNoteSequence.sort((noteA, noteB) => noteA.pitch - noteB.pitch);
                break;
            case ArpeggiatorMode.DOWN_2:
                arpeggiatorNoteSequence.forEach(note => s.push(note.copySelf()));
                s.forEach(note => note.pitch += 12);
                arpeggiatorNoteSequence.push(...s);
                arpeggiatorNoteSequence.sort((noteA, noteB) => noteB.pitch - noteA.pitch);
                break;
        }
        this.arpeggiatorNoteSequence = arpeggiatorNoteSequence;
    }

    // ---------------------------------------------------------------- public

    noteOn(pitch, velocity = 96, channel = 0) {

        // check that some pitch was passed in and return otherwise
        if (isNaN(pitch) || (typeof(pitch) !== "number")) {
            return;
        }

        // create a note object
        let note = new Note(pitch, velocity, channel);

        // check that this new note isn't already pressed
        if (this.noteEvents.some(
                noteEvent => noteEvent.getNote().equals(note))) {
            return;
        }

        // append a new note event
        // unlimited duration because the duration (and release) is unknown
        let unlimitedDuration = 0;
        let noteEvent = new NoteEvent(note, unlimitedDuration,
            this.delayRepeats, this.delayTimeInMilliseconds, this.midiOutput);
        this.noteEvents.push(noteEvent);

        // determine how to trigger this new note
        if (this.arpeggiatorMode == ArpeggiatorMode.OFF) {
            // if there's no arpeggiation active
            // fire a note on
            // this will not automatically release as its unlimited duration
            noteEvent.attack();
        } else {
            // else arpeggiation is active
            // update the arpeggiator sequence
            this.updateArpeggiatorSequence();
            // start the arpeggiator ticker (which fires its own note events)
            this.arpeggiatorTicker.start() // will not restart if already on
        }
    }

    noteOff(pitch, velocity = 0, channel = 0) {

        // check that some pitch was passed in and return otherwise
        if (isNaN(pitch) || (typeof(pitch) !== "number")) {
            return;
        }

        // create a note object
        let note = new Note(pitch, velocity, channel);

        // if there isn't an existing note event corresponding to this note
        // then just return
        let noteEvent = this.noteEvents.find(
            noteEvent => noteEvent.getNote().equals(note));
        if (noteEvent === undefined) {
            return;
        }

        // find note event index and splice it
        let noteEventIndex = this.noteEvents.findIndex(
            noteEvent => noteEvent.getNote().equals(note));
        this.noteEvents.splice(noteEventIndex, 1);

        // determine how to release this (now removed) note event
        if (this.arpeggiatorMode == ArpeggiatorMode.OFF) {
            // if there's no arpeggiation active
            // release this note event
            noteEvent.release();
        } else {
            // else arpeggiation is active
            this.updateArpeggiatorSequence();
            // stop arpeggiator ticker if there are no remaining note events
            if (this.noteEvents.length == 0) {
                this.arpeggiatorTicker.stop();
                // reset arpeggiator note sequence index
                this.arpeggiatorNoteSequenceIndex = 0;
            }
        }
    }

    // send a program change value [0-127]
    programChange(programChangeValue, channel = 0) {
        // clamp channel between 0 and 15 inclusive
        // and clamp program change value between 0 and 127 inclusive
        channel = Math.max(0, Math.min(channel, 15));
        programChangeValue = Math.max(0, Math.min(programChangeValue, 127));
        // bitwise or with the channel to produce the correct status byte
        let statusByte = 0b11000000 | channel;
        this.midiOutput.send([statusByte, programChangeValue]);
    }

    // set the type of arpeggiation
    setArpeggiatorMode(arpeggiatorMode) {

        let oldMode = this.arpeggiatorMode;
        let newMode = arpeggiatorMode;
        this.arpeggiatorMode = arpeggiatorMode;
        // update the arpeggiator sequence with the new mode
        this.updateArpeggiatorSequence();

        if (oldMode !== ArpeggiatorMode.OFF &&
            newMode === ArpeggiatorMode.OFF) {
            // if we're turning the arpeggiator from on to off
            // stop the arpeggiator ticker
            this.arpeggiatorTicker.stop();
            // reset arpeggiator note sequence index
            this.arpeggiatorNoteSequenceIndex = 0;
            // and turn on existing note events
            this.noteEvents.forEach(noteEvent => {
                noteEvent.attack();
            });
        } else if (oldMode === ArpeggiatorMode.OFF &&
            newMode !== ArpeggiatorMode.OFF) {
            // else if the arpeggiator was off and we're turning it on
            // if there are existing (active) note events turn them all off
            this.noteEvents.forEach(noteEvent => {
                noteEvent.release();
            });
            // start the arpeggiator ticker IF there are note events
            if (this.noteEvents.length > 0) {
                this.arpeggiatorTicker.start();
            }
        }
    }

    setBPM(bpm) {
        // clamp bpm
        bpm = Math.max(32, Math.min(bpm, 256));
        // we must recalculate all internal timing as it's relative to the BPM
        // get the ratio of the old to new BPM
        let r = this.BPM / bpm;
        // then discard the old
        this.BPM = bpm;
        // then recalculate arpeggiator gate time / tick rate, and delay time
        this.arpeggiatorTicker.setRate(this.arpeggiatorTicker.getRate() / r);
        this.arpeggiatorGateTimeInMilliseconds *= r;
        this.delayTimeInMilliseconds *= r;
    }

    getBPM() {
        return this.BPM;
    }


    // set the arpeggiation trigger rate
    setArpeggiatorTimeDivision(timeDivision) {
        // get the existing gate time percentage
        let arpeggiatorTickDurationInMilliseconds = 1000 / this.arpeggiatorTicker.getRate();
        let arpeggiatorGateTimePercentage = this.arpeggiatorGateTimeInMilliseconds / arpeggiatorTickDurationInMilliseconds;
        // set new gate time (in milliseconds) using the prior gate time
        this.arpeggiatorGateTimeInMilliseconds = Math.floor(arpeggiatorGateTimePercentage * this.calculateDurationInMilliseconds(timeDivision, this.BPM));
        // set new arpeggiator tick rate
        this.arpeggiatorTicker.setRate(this.calculateTickRate(timeDivision, this.BPM));
    }

    // set the arpeggiation gate time to 0.05 to 0.9
    setArpeggiatorGateTime(percentage) {
        // clamp percentage
        percentage = Math.max(0.05, Math.min(percentage, 0.9));
        // scale the existing gate time
        let arpeggiatorTickDurationInMilliseconds = 1000 / this.arpeggiatorTicker.getRate();
        this.arpeggiatorGateTimeInMilliseconds = Math.floor(percentage * arpeggiatorTickDurationInMilliseconds);
    }

    // sets the # of repeats in the delay effect, may be 0 to 9 where 0 means
    // delay effect is off and greater than 9 is ignored
    setDelayRepeats(numberOfRepeats) {
        this.delayRepeats = Math.max(0, Math.min(numberOfRepeats, 9));
    }

    // sets delay time relative to the BPM in time divisions
    setDelayTime(timeDivision) {
        this.delayTimeInMilliseconds =
            this.calculateDurationInMilliseconds(timeDivision, this.BPM);
    }

    // sets delay time in milliseconds
    setDelayTimeInMilliseconds(delayTimeInMilliseconds) {
        // make sure it's greater than or equal to 0
        delayTimeInMilliseconds = Math.max(0.0, delayTimeInMilliseconds);
        this.delayTimeInMilliseconds = delayTimeInMilliseconds;
    }

    // release every note event
    releaseEverything() {
        for (let i = 0; i < this.noteEvents.length; ++i) {
            let noteEvent = this.noteEvents.pop();
            noteEvent.release();
        }
        this.updateArpeggiatorSequence();
    }

    // send death wall
    hailMary() {
        this.releaseEverything();
        let messages = [];
        for (let channel = 0; channel < 16; ++channel) {
            for (let pitch = 0; pitch < 128; ++pitch) {
                messages.push(0b10000000 | channel, pitch, 0);
            }
        }
        this.midiOutput.send(messages);
    }

    // sets the midi output (where midi data is sent)
    setMidiOutput(midiOutput) {
        // we have to shutdown *everything* before we change the midi output
        // otherwise this could cause a sticky note (note off never sent)
        this.releaseEverything();
        this.midiOutput = midiOutput;
    }

    // sets a callback to trigger when midi messages are sent out
    // intended as a logging mechanism
    setLoggingCallback(callback) {
        this.loggingCallback = callback;
    }
}
