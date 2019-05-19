// triggers each step in a step sequence for a step duration of time
class StepSequencer {

    constructor() {
        this.isPlaying = false;

        // the actual steps, 128 max for no reason besides industry standards
        this.steps = new Array(128);
        // how many steps our sequence will be, 16 steps is a good default
        this.length = 16;
        // how many steps is considered a beat, 4 is a good default
        this.stepsPerBeat = 4;
        // the bpm, 120 is a good default
        this.bpm = 120;
        // calculate step duration from BPM and steps per beat
        this.calculateStepDurationInMilliseconds();

        // how long we want each step to attack
        this.gatePercentage = 0.9;

        // how we want to move through the sequence
        this.playbackMode = PlaybackMode.FORWARD;

        // how far to lookahead
        this.lookaheadTimeInMilliseconds = 100;
        // which step (in multiples of step duration offset when it started)
        // we're currently at (or have scheduled up to)
        this.currentStepTimeInMilliseconds = 0;
        // which step we're currently at, never beyond [0 to length-1]
        this.currentStep = 0;

        // (janky) ticker which schedules (unjankified) events
        let n = 3;
        let rate = 1000 / (this.lookaheadTime / n);
        this.ticker = new Ticker(rate);
        this.ticker.setCallback(this.tick.bind(this));
    }

    ////////////////////////////////////////////////////////////////// private

    // An explanation of this callback.  Events of midi or audio can be
    // sequenced highly accurately, but we don't want to sequence too many of
    // them in the future as this would degrade the user experience (ie. it
    // wouldn't feel realtime editable anymore).  Hence we choose a lookahead
    // window which is short enough for the user to not notice, and schedule
    // from the current scheduled step time to now+lookahead, *then* advance
    // current scheduled step time by however many steps were scheduled.  This
    // callback however is JS's admittedly inaccurate timing
    // mechanism, setInterval/setTimeout, so we call this callback multiple
    // times per lookahead to avoid jank.

    tick() {

        // stop ticker (and this callback) if we've stopped playing
        if (!this.isPlaying) {
            this.ticker.stop();
            return;
        }

        for (
            // get now, get later (which is now + lookahead)
            let now = performance.now(), later = now + this.lookaheadTimeInMilliseconds;
            // while current step time < later
            this.currentStepTimeInMilliseconds < later;
            // update current step
            this.currentStep = this.nextStep(),
            this.currentStepTimeInMilliseconds += this.stepDurationInMilliseconds
        ) {
            // schedule a step
            let stepEvent = this.steps[this.currentStep];
            if (stepEvent == undefined) {
                continue; // skip scheduling if it's undefined (obviously)
            }
            let duration = this.stepDurationInMilliseconds * this.gatePercentage;
            let when = currentStepTimeInMilliseconds;
            stepEvent.attackRelease(duration, when);
        }
    }

    // calculates the next step index from playback mode
    nextStep() {
        let nextStepIndex;
        switch (this.playbackMode) {
            case PlaybackMode.REVERSE:
                nextStepIndex = (this.currentStep > 0) ? (this.currentStep - 1) : (this.length - 1);
                break;
            case PlaybackMode.RANDOM:
                nextStepIndex = Math.floor(Math.random() * this.length);
                break;
            case PlaybackMode.FORWARD:
            default:
                nextStepIndex = (this.currentStep + 1) % this.length;
                break;
        }
        return nextStepIndex;
    }

    // calculates the step duration in milliseconds from BPM and stepsPerBeat
    calculateStepDurationInMilliseconds() {
        // the duration of a step, can be derived from BPM and stepsPerBeat
        this.stepDurationInMilliseconds =
            1000 / ((this.bpm / 60) * this.stepsPerBeat);
    }

    /////////////////////////////////////////////////////////////////// public

    // starts the step sequencer (obviously)
    start(offsetStep = 0) {
        // do nothing if we're already playing
        if (this.isPlaying) {
            return;
        }
        // otherwise
        // choose an arbitrary (but user unnoticeable) time from now to start
        let startOffsetInMilliseconds = this.lookaheadTimeInMilliseconds / 2.0;
        let now = performance.now();
        this.currentStepTimeInMilliseconds = now + startOffsetInMilliseconds;
        // choose which step index we're starting on
        this.currentStep =
            Math.trunc(Math.min(Math.max(0, offsetStep), this.length - 1));
        // flag that we've entered playback
        this.isPlaying = true;
        // start the internal scheduling ticker
        this.ticker.start();
    }

    // stops the step sequencer (obviously)
    stop() {
        // scheduling ticker will stop itself setting this flag
        this.isPlaying = false;
    }

    // sets a step to a note event
    setStep(stepIndex, noteEvent) {
        this.steps[stepIndex] = noteEvent;
    }

    // sets how long this sequence is
    // clamped between 1 and 128 steps
    setLength(length) {
        this.length = Math.trunc(Math.min(Math.max(1, length), 128));
    }

    // sets how many steps represent a beat
    // clamped between 1 and 16
    setStepsPerBeat(stepsPerBeat) {
        this.setStepsPerBeat = Math.trunc(Math.min(Math.max(1, stepsPerBeat), 16));
        this.calculateStepDurationInMilliseconds();
    }

    // sets the BPM, clamped between 30 and 999
    setBPM(bpm) {
        this.bpm = Math.min(Math.max(30, bpm), 999);
        this.calculateStepDurationInMilliseconds();
    }

    // gets the BPM (obviously)
    getBPM(bpm) {
        return this.bpm;
    }

    // sets the gate, between 0.05 and 0.95
    setGateTime(gatePercentage) {
        this.gatePercentage = Math.min(Math.max(0.05, gatePercentage), 0.95);
    }
}
