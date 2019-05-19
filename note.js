
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
