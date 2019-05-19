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
        //
        this.calculateStepDurationInMilliseconds();

        // how long we want each step to attack
        this.gatePercentage = 0.9;

        // how we want to move through the sequence
        this.playbackMode = PlaybackMode.FORWARD;

        // when the sequence started
        this.startTimeInMilliseconds = 0;
        // how far to lookahead
        this.lookaheadTimeInMilliseconds = 100;
        // how far we've scheduled up to
        this.scheduledUpToTimeInMilliseconds = 0;
        this.currentStep = 0;
        // tick n times per lookahead to avoid jank (arbitrarily chosen)
        let n = 3;
        let rate = 1000 / (this.lookaheadTime / n);
        this.ticker = new Ticker(rate);
        this.ticker.setCallback(this.tick.bind(this));
    }

    ////////////////////////////////////////////////////////////////// private

    // An explanation of this callback.
    // Timing things accurately in JS is difficult to say the least if
    // you're using something like setTimeout() or setInterval().
    // Highly highly jank.  Fortunately, we have extremely accurate
    // timestamps utilizing performance.now() to schedule things at
    // exact moments particularly something like a midi event.  There's
    // a problem however.  If you're making something like a step
    // sequencer, you want near realtime feedback, so you can't
    // schedule too many events which brings you back to the original
    // problem of innaccuracy.  We must strike a balance.  Therefore,
    // we choose a lookahead time, say 100ms, which is short enough to
    // feel responsive, and long enough to allow us a window to queue.
    // Our setInterval runs N times within that lookahead window,
    // sidestepping the issue of it janking out randomly, always trying
    // to schedule a lookahead amount of time ahead.  We don't want
    // duplicate schedules however, so we keep track of where in time
    // our sequence of events is, that is, what has already been
    // scheduled, and increment this with each tick by whatever
    // lookahead overlaps it by.  Yep, this is confusing.
    tick() {

        // stop ticker (and this callback) if we've stopped playing
        if (!this.isPlaying) {
            this.ticker.stop();
            return;
        }

        for (
            // get now and later (which is now + lookahead)
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
        // arbitrarily chosen starting offset time
        let startOffsetInMilliseconds = this.lookaheadTimeInMilliseconds / 2.0;
        let now = performance.now();
        this.currentStepTimeInMilliseconds = now + startOffsetInMilliseconds;
        this.currentStep =
            Math.trunc(Math.min(Math.max(0, offsetStep), this.length - 1));
        this.isPlaying = true;
        this.ticker.start();
    }

    // stops the step sequencer (obviously)
    stop() {
        // ticker will stop itself reading this boolean and clean up the
        // requisite future scheduled notes
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
        this.setStepsPerBeat = Math.trunc(Math.min(Math.max(1, s), 16));
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
