// "enums" for our various components

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
};

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

// "enum" for (step sequencer) playback modes
const PlaybackMode = {
    FORWARD: 0,
    REVERSE: 1,
    RANDOM: 2,
};
