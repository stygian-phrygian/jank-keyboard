export default class Ticker {
    // rate is specified as hz, so rate = 3 = 3hz
    constructor(rate = 1) {
        this.rate = rate;
        this.callback = function() {
            console.log("Hello World!");
        };
        // for use in starting/stopping a timer set/clear by setInterval()/clearInterval
        this.timerID = undefined;
    }

    isTicking() {
        return this.timerID != undefined;
    }

    getCallback() {
        return this.callback;
    }

    setCallback(callback) {
        if (this.isTicking()) {
            this.stop();
            this.callback = callback;
            this.start();
        } else {
            this.callback = callback;
        }
    }

    getRate() {
        return this.rate;
    }

    setRate(rate) {
        if (this.isTicking()) {
            this.stop();
            this.rate = rate;
            this.start();
        } else {
            this.rate = rate;
        }
    }

    start() {
        if (!this.isTicking()) {
            this.timerID = setInterval(this.callback, (1 / this.rate) * 1000);
        }
    }

    stop() {
        if (this.isTicking()) {
            clearInterval(this.timerID);
            this.timerID = undefined;
        }
    }
}
