// import {
//     Engine,
//     Note
// } from "./engine.js";

// // which keys trigger which midi pitch (just pitch, not velocity or channel)
// import {
//     keyboardLayouts
// } from "./keyboardLayouts.js";

///////////////////////////////////////////////////////////////////////////////
// global variables
// the entire web midi system's access: https://www.w3.org/TR/webmidi/#idl-def-MIDIAccess
let midiAccess;
// where to send notes: https://www.w3.org/TR/webmidi/#idl-def-MIDIOutput
// initialized to a dummy object
let midiOutput = {
    send: () => {
        console.error("Midi is unavailable");
    }
};
// which channel to send events over
let midiChannel = 0;
// which velocity to send
let midiVelocity = 96;
// how much to transpose the events
let transpose = 0;
// our midi engine (initialized with dummy midi output)
let engine = new Engine(midiOutput);
// our selected keyboard layout
let keyboardLayout;
// which keys are *currently* held down and their requisite note values
let pressedKeys = {};
///////////////////////////////////////////////////////////////////////////////

// after the window is loaded ---> initialize
window.addEventListener("load", initialize);

function initialize() {
    // check if midi available and request midi access (on success)
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(midiAccessSuccess, midiAccessFailure);
    }

    initializeKeyboardLayoutSelect(keyboardLayouts);
    initializeArpeggiatorGateInput();
    initializeDelayTimeInput();
    initializeDelayRepeatInput();
    initializeBPMInput();
    initializeOctaveSelect();
    initializeChannelSelect();

    // connect key presses/releases to midi note on/off events
    window.addEventListener("keydown", keyPressed);
    window.addEventListener("keyup", keyReleased);

}

function keyPressed(e) {
    let pitch = keyboardLayout[e.key];
    if (pitch !== undefined) {
        // if we got a pitch from the layout
        // create a new note and save it in the pressed keys
        let note = new Note(pitch + transpose, midiVelocity, midiChannel);;
        pressedKeys[e.key] = note;
        // and trigger a note on in our engine
        engine.noteOn(note.pitch, note.velocity, note.channel);
    }

    // other possible key behavior here
    switch (e.key) {
        case "Backspace":
            engine.releaseEverything();
            break;
        case "Escape":
            engine.hailMary();
            break;
    }
}

function keyReleased(e) {
    // try to fetch a corresponding note to release from the pressed keys
    // ignore otherwise
    let note = pressedKeys[e.key];
    if (note !== undefined) {
        engine.noteOff(note.pitch, note.velocity, note.channel);
    }
}


// callback: on midi access successfully acquired /////////////////////////////
function midiAccessSuccess(midiAccess) {
    // save reference to midi access
    midiAccess = midiAccess;
    // save reference to first midi output (which our callbacks will send data through)
    // this is a hacky... method to get the first value of the outputs map (works on ubuntu at least)
    midiOutput = midiAccess.outputs.get(midiAccess.outputs.keys().next().value);
    // create a new engine
    engine = new Engine(midiOutput);
    // initialize device select UI (to display the available midi outputs)
    initializeDeviceSelect(midiAccess);
}

// callback: on midi access unsuccessfully acquired ///////////////////////////
function midiAccessFailure() {
    console.error("Could not initialize midi")
}

// populate midi devices on UI, select a device, hook a change callback to our select element
function initializeDeviceSelect(midiAccess) {
    let selectElement = document.querySelector("#deviceSelect");
    // for each entry in available midi output ports
    for (var entry of midiAccess.outputs) {
        // append an option to our device select element
        let output = entry[1];
        let option = document.createElement("option");
        option.text = output.name;
        selectElement.add(option);
    }
    // register a change callback for this device select element
    selectElement.addEventListener("change", (e) => {
        let selectedMidiOutputName = e.target.value;
        for (let entry of midiAccess.outputs) {
            let output = entry[1];
            if (output.name == selectedMidiOutputName) {
                midiOutput = output;
                engine.setMidiOutput(output);
                return;
            }
        }
    });
    // pick a default midi output
    selectElement.selectedIndex = "0";
    selectElement.dispatchEvent(new Event("change"));
}

// populate keyboard layouts on UI, select a layout, hook a change callback to our select element
function initializeKeyboardLayoutSelect(keyboardLayouts) {
    let selectElement = document.querySelector("#keyboardLayoutSelect");
    // create layout name options for our keyboard layout select element
    Object.keys(keyboardLayouts).forEach(keyboardLayoutName => {
        let option = document.createElement("option");
        option.text = keyboardLayoutName;
        selectElement.add(option);
    });
    // attach a callback for changes
    selectElement.addEventListener("change", (e) => {
        keyboardLayout = keyboardLayouts[e.target.value];
    });
    // pick a default option
    selectElement.selectedIndex = 0;
    selectElement.dispatchEvent(new Event("change"));
}

function initializeOctaveSelect() {
    let selectElement = document.querySelector("#octaveSection select");
    // add a callback to the select element
    selectElement.addEventListener("change", (e) => {
        // we receive octave 4...
        // c4 = midi 60 = 12*(4 + 1)
        transpose = 12 * (parseInt(e.target.value) + 1);
    });
    // select a default option, let's pick whichever octave 3
    let options = document.querySelectorAll("#octaveSection option");
    let defaultOption;
    options.forEach(option => {
        if (parseInt(option.value) == 3) {
            defaultOption = option;
        }
    });
    selectElement.selectedIndex = defaultOption.index;
    selectElement.dispatchEvent(new Event("change"));
}

function initializeChannelSelect() {
    selectElement = document.querySelector("#channelSection select");
    // add a callback to the select element
    selectElement.addEventListener("change", (e) => {
        midiChannel = parseInt(e.target.value);
        console.log(midiChannel);
    });
    // select first
    selectElement.selectedIndex = 0;
    selectElement.dispatchEvent(new Event("change"));
}

function initializeBPMInput() {
    let inputElement = document.querySelector("#bpmSection input");
    // add callback to input element change
    inputElement.addEventListener("change", (e) => {
        let v = parseFloat(e.target.value);
        // input[type=number] will APPARENTLY send invalid input outside of the
        // min/max specified.  Our engine should handle it no problemo, the
        // problemo is that the element will display an incorrect value there.
        // We display whatever the engine allowed to occur.
        engine.setBPM(v);
        // update our UI
        e.target.value = engine.BPM;
    });
    // fire initial event to set it
    inputElement.dispatchEvent(new Event("change"));
}

function initializeArpeggiatorGateInput() {
    let inputElement = document.querySelector("#arpeggiatorGateSection input");
    let labelElement = document.querySelector("#arpeggiatorGateSection label");
    // add callback to input element change
    inputElement.addEventListener("change", (e) => {
        let v = parseFloat(e.target.value);
        // send value into engine
        engine.setArpeggiatorGateTime(v);
        // update our UI
        labelElement.innerHTML = Math.trunc(v * 100).toString() + "%";
    });
    // fire initial event to set it
    inputElement.dispatchEvent(new Event("change"));
}

function initializeDelayTimeInput() {
    let inputElement = document.querySelector("#delayTimeSection input");
    let labelElement = document.querySelector("#delayTimeSection label");
    // add callback to input element change
    inputElement.addEventListener("change", (e) => {
        let v = parseInt(e.target.value);
        // send value into engine
        engine.setDelayTimeInMilliseconds(v);
        // update our UI
        labelElement.innerHTML = v.toString() + "ms";
    });
    // fire initial event to set it
    inputElement.dispatchEvent(new Event("change"));
}



function initializeDelayRepeatInput() {
    let inputElement = document.querySelector("#delayRepeatSection input");
    let labelElement = document.querySelector("#delayRepeatSection label");
    // add callback to input element change
    inputElement.addEventListener("change", (e) => {
        let v = parseInt(e.target.value);
        // send value into engine
        engine.setDelayRepeats(v);
        // update our UI
        labelElement.innerHTML = v.toString();
    });
    // fire initial event to set it
    inputElement.dispatchEvent(new Event("change"));
}
