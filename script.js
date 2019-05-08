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
// our midi engine (initialized with dummy midi output)
let engine = new Engine(midiOutput);
// our selected keyboard layout
let keyboardLayout;
// which keys are *currently* held down and their requisite note values
let pressedKeys2Note = {};
///////////////////////////////////////////////////////////////////////////////

// after the window is loaded ---> initialize
window.addEventListener("load", initialize);

function initialize() {
    // check if midi available and request midi access (on success)
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(midiAccessSuccess, midiAccessFailure);
    }

    initializeKeyboardLayoutSelect(keyboardLayouts);

    // connect key presses/releases to midi note on/off events
    window.addEventListener("keydown", keyPressed);
    window.addEventListener("keyup", keyReleased);

}

function keyPressed(e) {
    console.log("pressed: ", e.key);
    let pitch = keyboardLayout[e.key] + 48;
    console.log("pitch: ", pitch);
    engine.noteOn(pitch);

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
    let pitch = keyboardLayout[e.key] + 48;
    engine.noteOff(pitch);
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
    let deviceSelectElement = document.querySelector("#deviceSelect");
    // for each entry in available midi output ports
    for (var entry of midiAccess.outputs) {
        // append an option to our device select element
        let output = entry[1];
        let option = document.createElement("option");
        option.text = output.name;
        deviceSelectElement.add(option);
    }
    // register a change callback for this device select element
    deviceSelectElement.addEventListener("change", function(e) {
        let selectedMidiOutputName = deviceSelectElement.value;
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
    deviceSelectElement.selectedIndex = "0";
    deviceSelectElement.dispatchEvent(new Event("change"));
}

// populate keyboard layouts on UI, select a layout, hook a change callback to our select element
function initializeKeyboardLayoutSelect(keyboardLayouts) {
    let keyboardLayoutSelectElement = document.querySelector("#keyboardLayoutSelect");
    // create layout name options for our keyboard layout select element
    Object.keys(keyboardLayouts).forEach(keyboardLayoutName => {
        let option = document.createElement("option");
        option.text = keyboardLayoutName;
        keyboardLayoutSelectElement.add(option);
    });
    // attach a callback for changes
    keyboardLayoutSelectElement.addEventListener("change", () => {
        keyboardLayout = keyboardLayouts[keyboardLayoutSelectElement.value];
    });
    // pick a default option
    keyboardLayoutSelectElement.selectedIndex = "0";
    keyboardLayoutSelectElement.dispatchEvent(new Event("change"));
}
