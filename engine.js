// an engine which triggers midi events on some MIDIOutput device
// it has built in midi effects:
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
        // user set midi logging callback (initialized to an empty callback)
        this.loggingCallback = () => {};
    }

    // --------------------------------------------------------------- private

    // updates the arpeggiator sequence according to
    // the provided arpeggiator mode and existing note events
    updateArpeggiatorSequence() {
        // get the notes which are active from the engine's note events
        let arpeggiatorNoteSequence = [];
        this.noteEvents.forEach(
            noteEvent => arpeggiatorNoteSequence.push(noteEvent.getNote()));
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
        if (this.noteEvents.some(noteEvent => noteEvent.getNote().equals(note))) {
            return;
        }

        // append a new note event
        let noteEvent = new NoteEvent(
            note, this.delayRepeats, this.delayTimeInMilliseconds,
            this.midiOutput, this.loggingCallback);
        this.noteEvents.push(noteEvent);

        // determine how to trigger this new note
        if (this.arpeggiatorMode == ArpeggiatorMode.OFF) {
            // if there's no arpeggiation active
            // fire a note on
            // this will not automatically release as it's unlimited duration
            noteEvent.attack();
        } else {
            // else arpeggiation is active
            // update the arpeggiator sequence
            this.updateArpeggiatorSequence();
            // start the arpeggiator (which fires its own note events)
            this.arpeggiatorStepSequencer.start() // will not restart if already on
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
            // if there are no remaining note events, stop the arpeggiator
            if (this.noteEvents.length == 0) {
                this.arpeggiatorStepSequencer.stop();
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
            // stop the arpeggiator
            this.arpeggiatorStepSequencer.stop();
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
            // start the arpeggiator IF there are note events
            if (this.noteEvents.length > 0) {
                this.arpeggiatorStepSequencer.start();
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
        // you better pass in a valid TimeDivision enum value lest explosion
        this.arpeggiatorStepSequencer.setStepsPerBeat(timeDivision);
    }

    // set the arpeggiation gate time
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
