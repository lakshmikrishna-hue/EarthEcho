# EarthEcho
*Hearing out our planet's voice.*

Built by Team [MEGAMIND] ([Lakshmi Krishna , Vaiga M R , M S Kalaveni , Srutha Keerti D R]) for the 2026 NASA Space Apps
Challenge, "Earth Jukebox" challenge.

## What it does
An accessible web app that turns a NASA Earth visualization into sound.
A playhead scans the image left to right, and each column is played as
musical notes, so blind and low-vision users can explore Earth science
by ear.

## How the image becomes sound
- The image is divided into a 16×8 grid.
- Row (height) → pitch, using the C major pentatonic scale (C4–E5)
- Brightness → volume
- Warm vs. cool color → triangle vs. sine wave
- Playhead position → stereo pan (left to right)
- Scan speed is adjustable (1–12 columns per second)

## Accessibility
Keyboard control (Space = play/pause, arrows = speed), skip link,
screen-reader live description of what is playing, high-contrast mode,
large-text mode, labeled controls, reduced-motion support.

## NASA data used
- [https://svs.gsfc.nasa.gov/5313/]
- [https://svs.gsfc.nasa.gov/5011/]
- [https://svs.gsfc.nasa.gov/4950/]

## Project Presentation

[[EarthEcho Pitch Deck](https://drive.google.com/file/d/1nFsSr-g_ivnm0_cYZmSAkMB2IQLORuil/view?usp=sharing)]

## Live demo
[[EarthEcho](https://lakshmikrishna-hue.github.io/EarthEcho/)]

## Use of AI
This project was built with AI assistance (Google AI Studio and
Claude). [Google AI Studio: Main App Framework].
[Claude : Data reaserch and mobilisation, designing]

## Credits
Imagery: NASA Scientific Visualization Studio.
