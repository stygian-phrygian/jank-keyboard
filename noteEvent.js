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
    send(midiBytesArray, when) {
        this.midiOutput.send(midiBytesArray, when);
        this.loggingCallback(midiBytesArray);
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
            // nota bene, we can't log the delayed midi bytes in this loop
            // the midi system can *only* queue midi events accurately
            // a setTimeout would be inaccurate so we'll forgo logging here
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
    attack(when) {
        if (when === undefined) {
            when = performance.now();
        }
        let noteOnMidiBytesArray = this.note.toNoteOnMidiBytesArray();
        this.send(noteOnMidiBytesArray, when);
        this.attacks += 1;
    }

    // triggers (unlimited duration) note off (only) event stream after startTimeInMilliseconds
    // with an optional timestamp (see below URL for info on the timestamp)
    // https://www.w3.org/TR/webmidi/#midioutput-interface
    release(when) {
        if (this.releases < this.attacks) {
            if (when === undefined) {
                when = performance.now();
            }
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
