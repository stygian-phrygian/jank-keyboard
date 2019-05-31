
# Jank MIDI Keyboard
Turn your computer keyboard into a MIDI keyboard.

## Usage
* Open index.html in your browser (Google Chrome is the only [current] browser with WebMIDI)
* Select the MIDI output device (one is already selected by default).
* Select which note layout you'd like (one is already selected by default).
* Play with the arpeggiator and delay
* Type on your keyboard to trigger and release midi notes

## Keybindings
```
    letter/numbers         => MIDI Note ON/OFF
    ctrl-left/ctrl-right   => Keybord Layout previous/next
    ctrl-down/ctrl-up      => Octave down/up
    alt-left/alt-right     => Arpeggiator Mode previous/next
    alt-down/alt-up        => Arpeggiator Gate decrease/increase
    shift-left/shift-right => Delay Time decrease/increase
    shift-down/shift-up    => Delay Repeat decrease/increase
    page-down/page-up      => Program Change decrease/increase
    escape                 => Toggle Latch Mode
    backspace              => Note OFF all existing notes
    delete                 => Note OFF every possible note
```

## Screenshot
![screenshot](screenshot.png)

