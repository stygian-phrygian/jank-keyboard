

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
    constructor(note, delayRepeats = 0, delayTimeInMilliseconds = 500,
        midiOutput, loggingCallback) {
        // copy the note
        this.note = note.copySelf();
        // where to send the midi bytes
        this.midiOutput = midiOutput;
        // number of delay repeats and delay time
        this.delayRepeats = delayRepeats;
        this.delayTimeInMilliseconds = delayTimeInMilliseconds;
        // the number of attacks/releases so we don't send unbalanced messages
        // releases must always be <=  attacks
        this.attacks = 0;
        this.releases = 0;
        // executes with midi sent
        if (loggingCallback == undefined) {
            this.loggingCallback = () => {};
        }
        this.loggingCallback = loggingCallback;
    }
    // --------------------------------------------------------------- private
    // sends bytes to the midi output and logs them with the logging callback
    // https://www.w3.org/TR/webmidi/#midioutput-interface
    send(midiBytesArray, when = 0) {
        this.midiOutput.send(midiBytesArray, when);
        this.loggingCallback(midiBytesArray, when);
        // for the number of (delay) repeats, trigger our delayed midi events
        // with decaying velocity (to simulate a delay effect)
        let [statusByte, pitch, velocity] = midiBytesArray;
        for (let i = 1; i <= this.delayRepeats; ++i) {
            when += this.delayTimeInMilliseconds;
            let reductionFactor = i / (this.delayRepeats + 1);
            // make sure velocity is at least 1, this way we can avoid
            // sending a note off event through a note on with 0 velocity
            let reducedVelocity = Math.max(1, velocity -
                Math.floor(velocity * reductionFactor));
            this.midiOutput.send([statusByte, pitch, reducedVelocity], when);
        }
    }

    // ---------------------------------------------------------------- public
    // triggers a (limited duration) note on/off event stream
    // with an optional timestamp (see below URL for info on the timestamp)
    // https://www.w3.org/TR/webmidi/#midioutput-interface
    attackRelease(durationInMilliseconds = 500, when = 0) {
        let noteOnMidiBytesArray = this.note.toNoteOnMidiBytesArray();
        let noteOffMidiBytesArray = this.note.toNoteOffMidiBytesArray();
        this.send(noteOnMidiBytesArray, when);
        this.send(noteOffMidiBytesArray, when + durationInMilliseconds);
        // there is the potential that the midiOutput.clear() method will be
        // called in which case the attacks/releases will be inaccurate
        // reflections of the actual state of note on and off pairs.
        this.attacks += 1;
        this.releases += 1;
    }

    // triggers (unlimited duration) note on (only) event stream
    // with an optional timestamp (see below URL for info on the timestamp)
    // https://www.w3.org/TR/webmidi/#midioutput-interface
    attack(when = 0) {
        let noteOnMidiBytesArray = this.note.toNoteOnMidiBytesArray();
        this.send(noteOnMidiBytesArray, when);
        this.attacks += 1;
    }

    // triggers (unlimited duration) note off (only) event stream after startTimeInMilliseconds
    // with an optional timestamp (see below URL for info on the timestamp)
    // https://www.w3.org/TR/webmidi/#midioutput-interface
    release(when = 0) {
        if (this.releases < this.attacks) {
            let noteOffMidiBytesArray = this.note.toNoteOffMidiBytesArray();
            this.send(noteOffMidiBytesArray, when);
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
        // arpeggiator mode
        this.arpeggiatorMode = ArpeggiatorMode.OFF;
        // arpeggiator step sequencer
        this.arpeggiatorStepSequencer = new StepSequencer();
        // how many delay repeats
        this.delayRepeats = 0;
        // how much delay time
        this.delayTimeInMilliseconds = 500;
        // finally set a dummy logging callback until it is set by enduser
        this.loggingCallback = () => {};
    }

    // --------------------------------------------------------------- private

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
        let noteEvent =
            new NoteEvent(note, this.delayRepeats, this.delayTimeInMilliseconds,
                this.midiOutput, this.loggingCallback);
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
        let midiBytesArray = [statusByte, programChangeValue];
        this.midiOutput.send(midiBytesArray);
        this.loggingCallback(midiBytesArray);
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
        this.arpeggiatorStepSequencer.setBPM(bpm);
    }

    getBPM() {
        return this.arpeggiatorStepSequencer.getBPM();
    }


    // set the arpeggiation trigger rate
    setArpeggiatorTimeDivision(timeDivision) {
        switch (timeDivision) {
            case TimeDivision.WHOLE_NOTE: // 16 steps
                // 1 step per beat
                break;
            case TimeDivision.HALF_NOTE_DOTTED: // 12 steps
                break;
            case TimeDivision.HALF_NOTE: // 8 steps
                // 2 steps per beat
                break;
            case TimeDivision.QUARTER_NOTE_DOTTED: // 6 steps
                break;
            case TimeDivision.QUARTER_NOTE: // 4 steps
                // 4 steps per beat
                break;
            case TimeDivision.EIGHTH_NOTE_DOTTED: // 3 steps
                break;
            case TimeDivision.EIGHTH_NOTE: // 2 steps
                // 2 steps per beat
                break;
            case TimeDivision.SIXTEENTH_NOTE_DOTTED: // 1.5 step
                break;
            case TimeDivision.SIXTEENTH_NOTE: // 1 step
                break;
            case TimeDivision.THIRTY_SECOND_NOTE: // 0.5 step
                break;
        }
    }

    // set the arpeggiation gate time to 0.05 to 0.95
    setArpeggiatorGateTime(percentage) {
        this.arpeggiatorStepSequencer.setGateTime(percentage);
    }

    // sets the # of repeats in the delay effect, may be 0 to 9 where 0 means
    // delay effect is off and greater than 9 is ignored
    setDelayRepeats(numberOfRepeats) {
        this.delayRepeats = Math.max(0, Math.min(numberOfRepeats, 9));
    }

    // sets delay time in milliseconds
    setDelayTimeInMilliseconds(delayTimeInMilliseconds) {
        // make sure it's greater than or equal to 0
        delayTimeInMilliseconds = Math.max(0.0, delayTimeInMilliseconds);
        this.delayTimeInMilliseconds = delayTimeInMilliseconds;
    }

    //TODO
    setLatch(latchOn) {
        if (latchOn) {
            // TODO
        } else {
            // TODO
        }
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
        // should we call the logging callback here to log this nuke?
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
