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
            // 1 step per beat
            QUARTER_NOTE:1 ,
            // 2 steps per beat
            EIGHTH_NOTE:2 ,
            // 3 steps per beat
            EIGHTH_NOTE_TRIPLET:3 ,
            // 4 steps per beat
            SIXTEENTH_NOTE:4 ,
            // 6 steps per beat
            SIXTEENTH_NOTE_TRIPLET:6 ,
};

// "enum" for (step sequencer) playback modes
const PlaybackMode = {
    FORWARD: 0,
    REVERSE: 1,
    RANDOM: 2,
};
