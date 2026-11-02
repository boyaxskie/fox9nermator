// Learn: how the example circuits are designed, step by step. "Open in Schematic" loads the circuit to play with.
import { el, store } from '../ui.js';
import * as S from '../sch-core.js';

// each article: id, title, example (or null), sections [[heading, html]]
const ARTICLES = [
  {
    id: 'preamp', title: 'Transistor audio preamp (common emitter)', example: 'preamp', tag: 'Amplifier',
    intro: 'One BC547 turns a 10 mV microphone signal into about 2 V. This is the classic textbook design: choose a few targets, and every part value falls out of simple Ohm\'s-law steps.',
    parts: [['B1', '9 V supply'], ['R1 / R2', '47 kΩ / 10 kΩ bias divider'], ['RC', '4.7 kΩ collector resistor'], ['RE', '1 kΩ emitter resistor'], ['CE', '100 µF emitter bypass'], ['CIN / COUT', '10 µF coupling capacitors'], ['LOAD', '10 kΩ (the next stage)']],
    steps: [
      ['1. Supply and resting point', 'Supply is <b>9 V</b>. The collector should rest near the <b>middle (≈ 4.5 V)</b> so the output can swing equally up and down before it clips.'],
      ['2. Collector current ≈ 1 mA', 'About 1 mA is a good low-noise working point for a BC547.<br><b>RC = 4.7 kΩ</b>: 1 mA × 4.7 kΩ ≈ 4.7 V drop → collector ≈ 9 − 4.7 = <b>4.3 V</b> (simulator: 4.8 V). ✔'],
      ['3. Emitter resistor = stability', '<b>RE = 1 kΩ</b> puts about <b>1 V</b> on the emitter (1 mA × 1 kΩ).<br>It works like negative feedback for DC: if the transistor tries to conduct more (hotter, higher β), the emitter voltage rises and pulls the current back. So any BC547 works the same.'],
      ['4. Base voltage from a divider', 'Base = emitter + 0.65 V (Vbe: the base-emitter junction is a silicon diode, it needs ≈ 0.65 V to conduct) ≈ <b>1.6 V</b>.<br>Divider: 9 V × 10k ÷ (47k + 10k) = <b>1.58 V</b>. ✔<br>Divider current ≈ 9 V ÷ 57 kΩ = 0.16 mA, about 30× the base current (1 mA ÷ β 200 = 0.005 mA), so β hardly moves the bias. Rule of thumb: divider current ≥ 10 × base current.'],
      ['5. Gain', 'For audio, <b>CE = 100 µF</b> shorts RE, so the signal only "sees" the transistor\'s own emitter resistance:<br>re = 26 mV ÷ Ic = 26 mV ÷ 0.89 mA ≈ <b>29 Ω</b><br>Gain = (RC ∥ LOAD) ÷ re = (4.7k ∥ 10k) ÷ 29 = 3.2k ÷ 29 ≈ <b>110</b>.<br>The simulator measures 2.2 V p-p out for 20 mV p-p in = 110. ✔ The output is <b>inverted</b> (upside down): normal for a common emitter.'],
      ['6. Coupling capacitors', '<b>CIN / COUT = 10 µF</b> pass the audio but block DC, so the mic and the next stage don\'t upset the 1.6 V bias.<br>Lowest frequency ≈ 1 ÷ (2π × R × C): with ≈ 8 kΩ input resistance and 10 µF → about <b>2 Hz</b>, far below 20 Hz bass. CE must be big because it works against small resistances (re): 1 ÷ (2π × 29 Ω × 100 µF) ≈ 55 Hz.'],
      ['Why the output is clean', 'Only 10 mV goes in, so the 2.2 V p-p output stays far from 0 V and 9 V: the transistor stays in its smooth middle region.'],
    ],
    tryit: ['Raise MIC amplitude to 50 mV: the bottom of the wave flattens (clipping, distortion).', 'Delete CE: gain drops to RC ÷ RE ≈ 3 (4.7k ∥ 10k ÷ 1k), but distortion almost disappears. Gain vs. clean sound is the classic trade-off.', 'Change RC to 2.2 kΩ: collector moves up to ≈ 7 V, gain halves.', 'Swap BC547 for 2N2222: almost nothing changes. That\'s RE doing its job.'],
  },
  {
    id: 'cedesign', title: 'Design a transistor amp for max performance (step by step)', example: 'preamp', tag: 'Amplifier',
    intro: 'How to pick every resistor and capacitor of a common-emitter amplifier from scratch: bias it for the biggest clean output swing, know the maximum gain one transistor can give, and stay out of clipping. Worked example: 9 V, 2N2222 / BC547, audio.',
    parts: [['Vcc', 'supply (9 V here)'], ['Ic', 'collector current you choose (≈ Ie)'], ['R1 / R2', 'base divider (R1 top, R2 bottom)'], ['RC / RE', 'collector / emitter resistors'], ['CE, CIN, COUT', 'bypass and coupling capacitors'], ['β', 'current gain: 2N2222 ≈ 150, BC547 ≈ 200 (use the low end)']],
    steps: [
      ['1. Choose the current Ic', 'Small-signal stages: <b>1–5 mA</b>. More current → smaller re (26 mV ÷ Ic) → more gain and less noise, but more battery drain and lower input resistance.<br>Example: <b>Ic ≈ 1.8 mA</b>.'],
      ['2. Emitter voltage ≈ 10 % of Vcc → RE', 'VE ≈ 0.1 × Vcc keeps the bias steady when temperature or β change (that is RE\'s real job).<br>VE ≈ 0.9 V → RE = VE ÷ Ic = 0.9 ÷ 0.0018 = 500 Ω → nearest standard value <b>470 Ω</b> (E12).<br>Real VE with 470 Ω: VE = Ic × RE = 0.0018 × 470 = <b>0.85 V</b>. Use this real value from now on.'],
      ['3. Collector in the middle → RC (max swing)', 'The collector can only move between two limits:<br>• bottom = VE + 0.2 V (transistor saturates) = 0.85 + 0.2 = 1.05 V<br>• top = Vcc = 9 V<br>Put VC exactly halfway (the average of bottom and top): <b>VC = (Vcc + VE + 0.2) ÷ 2</b> = (9 + 0.85 + 0.2) ÷ 2 = 10.05 ÷ 2 ≈ <b>5 V</b>.<br>RC = (Vcc − VC) ÷ Ic = 4 ÷ 0.0018 = 2.2 k → <b>1.8 k–2.2 k</b>. Centered = the biggest clean output, clipping top and bottom at the same time.'],
      ['4. Base divider (stiff bias)', 'The base must sit Vbe ≈ 0.65 V above the emitter (base-emitter = a silicon diode, it conducts at ≈ 0.6–0.7 V): VB = VE + 0.65 = 0.85 + 0.65 = <b>1.5 V</b>. Base current Ib = Ic ÷ β = 1.8 mA ÷ 150 = 12 µA.<br>Let the divider carry <b>≈ 10 × Ib</b> = 0.12 mA so β hardly matters:<br>R2 = VB ÷ 0.12 mA = 12.5 k → <b>12 k</b> · R1 = (Vcc − VB) ÷ 0.12 mA = 62 k → <b>56 k</b>.'],
      ['5. Gain, and the maximum one transistor can give', 'No CE: <b>A ≈ (RC ∥ RL) ÷ RE</b>, small but rock steady.<br>CE fully bypassing RE: <b>A ≈ (RC ∥ RL) ÷ re</b>, re = 26 mV ÷ Ic.<br>Maximum per stage ≈ (voltage across RC) ÷ 26 mV ≈ <b>40 × VRC</b>: with 4 V across RC → ≈ 150. On 9 V you can\'t go much above 150–170 with one transistor (more needs a higher supply or a second stage: 36 × 36 ≈ 1300).<br>Example: re = 26 ÷ 1.8 = 14.4 Ω; RC ∥ 10 k load = 1.8 k ∥ 10 k = 1.53 k → A ≈ <b>106</b>.'],
      ['6. Maximum output and input before clipping', 'Swing up: Vcc − VC ≈ 3.2 V. Swing down: VC − VE − 0.2 ≈ 4 V. The <b>smaller one</b> sets the limit: ≈ ±3 V (6 V p-p, less with a load).<br>Max input ≈ max output ÷ gain ≈ 3 V ÷ 106 ≈ 28 mV peak.<br>⚠ With CE fully bypassed the wave distorts BEFORE it clips (re changes with the signal): keep the input under ≈ 10 mV, or use the split emitter (next).'],
      ['7. Split emitter: high gain AND low distortion', 'RE = r1 (not bypassed) + r2 (bypassed by CE). Gain ≈ RC ÷ (re + r1). Even r1 = re halves the distortion and makes the gain independent of β and temperature.<br>Example for A ≈ 50: r1 = RC∥RL ÷ 50 − re = 1530 ÷ 50 − 14 ≈ 16 Ω → 15 Ω, r2 = 470 − 15 ≈ 470 Ω.'],
      ['8. Capacitors (lowest frequency f)', 'CE: Xc ≤ re ÷ 3 at f → <b>CE ≥ 1 ÷ (2π × f × re ÷ 3)</b>. 1 kHz → 33 µF; 100 Hz → 330 µF; 20 Hz → 1600 µF (most designs accept some bass loss with 100–470 µF).<br>CIN: fc = 1 ÷ (2π × Rin × C) ≥ 10× below f. Rin = R1 ∥ R2 ∥ (β × re) = 56 k ∥ 12 k ∥ 2.2 k ≈ 1.8 k → 20 Hz audio: CIN ≥ 1 ÷ (2π × 1800 × 2 Hz) ≈ 47 µF (10 µF gives fc ≈ 9 Hz: OK).<br>COUT: same with the load: 10 k + 10 µF → fc 1.6 Hz.'],
      ['9. Checked in the simulator', 'Preamp example with R1 56 k, R2 12 k, RC 1.8 k, RE 470 Ω, CE 220 µF, 1 kHz:<br><b>Vce 4.98 V, Ic 1.77 mA</b> (centered ✓) · <b>gain 104</b> (calculated 106 ✓)<br>10 mV in → 2.05 V p-p, clean · 20 mV in → 3.98 V p-p but the halves differ (+1.62 / −2.36 V): distortion starts, exactly as step 6 warns.'],
      ['10. Quick bias check of any CE stage', 'Measure (tap the transistor): <b>VE ≈ 10 % Vcc</b>, <b>VC between VE and Vcc, near the middle</b>, Vce ≥ 2 V. VC close to Vcc = transistor almost off (clips the top early); VC close to VE = almost saturated (clips the bottom).'],
    ],
    tryit: ['Open the example (Preamp) and set R1 56 k, R2 12 k, RC 1.8 k, RE 470 Ω, CE 220 µF: tap the BC547, Vce ≈ 5 V.', 'MIC 10 mV → ≈ 2 V p-p clean. MIC 30 mV → the bottom half stretches: distortion.', 'Split emitter: change RE to 470 Ω, add a 15 Ω between the emitter and RE (CE stays across the 470): gain ≈ 50, clean up to ≈ 50 mV.', 'Your own amp: tap the transistor and do the bias check of step 10.'],
  },
  {
    id: 'xc', title: 'Capacitors vs frequency: bypass and coupling caps', example: 'preamp', tag: 'Amplifier',
    intro: 'Why a 100 µF capacitor works perfectly at 1 kHz but only half-works at 60 Hz. A capacitor is not a fixed resistance: its "AC resistance" (reactance, Xc) falls as the frequency rises. Three formulas let you pick every coupling and bypass capacitor in an amplifier.',
    parts: [['Xc', 'reactance in Ω: what the capacitor "costs" an AC signal'], ['re', 'the transistor\'s own emitter resistance: 26 mV ÷ Ie'], ['Rin', 'input resistance of the stage: what the signal source sees'], ['fc', 'cut-off frequency of an R + C: below it the signal is lost']],
    steps: [
      ['1. Reactance: Xc = 1 ÷ (2π × f × C)', 'Double the frequency or double the capacitance → half the Xc.<br><b>100 µF:</b> 60 Hz → 26.5 Ω · 1 kHz → 1.6 Ω · 10 kHz → 0.16 Ω<br><b>1000 µF:</b> 60 Hz → 2.65 Ω<br><b>10 µF:</b> 60 Hz → 265 Ω · 1 kHz → 16 Ω<br>At DC (0 Hz) Xc is infinite: a capacitor blocks DC completely. That is why coupling caps keep the bias undisturbed.'],
      ['2. The emitter bypass capacitor (CE)', 'Without CE the gain is RC ÷ RE (small but very steady). CE "shorts" RE for AC, so the gain becomes RC ÷ re, much higher.<br><b>re = 26 mV ÷ Ie.</b> 26 mV is the thermal voltage of silicon at room temperature. Ie = 5 mA → re = 5.2 Ω; Ie = 0.89 mA → re = 29 Ω.<br>The bypass only works when <b>Xc(CE) is much smaller than re</b>. Otherwise: gain ≈ RC ÷ (re + Xc).'],
      ['3. Measured in the Preamp example (RC 4.7 k, re ≈ 29 Ω, CE 100 µF)', '<b>1 kHz:</b> Xc 1.6 Ω ≪ 29 Ω → gain <b>109</b><br><b>60 Hz:</b> Xc 26.5 Ω ≈ re → gain drops to <b>77</b><br><b>20 Hz:</b> Xc 80 Ω > re → gain only <b>35</b><br><b>60 Hz with CE = 1000 µF:</b> Xc 2.65 Ω → gain back to <b>107</b><br>Same circuit, same parts: only the frequency (or the capacitor) changed.'],
      ['4. Input resistance: Rin = R1 ∥ R2 ∥ (β × re)', 'The signal sees both bias resistors and the base. Looking into the base you see re multiplied by β (≈ 150 for a 2N2222, 200 for a BC547).<br>Example: 10 k ∥ 10 k = 5 k; β × re = 150 × 5.2 = 780 Ω; 5000 ∥ 780 = 1 ÷ (1/5000 + 1/780) ≈ <b>680 Ω</b>.<br>(∥ = "in parallel": 1 ÷ (1/a + 1/b).)'],
      ['5. Coupling capacitor cut-off: fc = 1 ÷ (2π × R × C)', 'CIN with Rin forms a high-pass filter. Below fc the signal is cut.<br>Rin 680 Ω + 10 µF → fc ≈ 23 Hz (too close to 60 Hz: some signal lost)<br>Rin 680 Ω + 47 µF → fc ≈ 5 Hz (60 Hz passes fully)<br>COUT works the same with the load resistance (scope 10 MΩ, speaker / next stage much less).'],
      ['6. Rules of thumb', '<b>Coupling caps:</b> fc at least 10× below the lowest frequency you care about.<br><b>Bypass cap:</b> Xc at the lowest frequency ≤ re ÷ 3 (so it barely adds).<br><b>Audio (20 Hz–20 kHz):</b> design for 20 Hz. <b>Mains hum / 60 Hz signals:</b> design for 60 Hz → big electrolytics (470–2200 µF bypass).<br><b>Electrolytic polarity:</b> + towards the higher DC voltage (emitter side for CE, base side for CIN when the source sits at 0 V).'],
      ['7. Steady gain trick (split emitter)', 'Put a small resistor in series with the bypassed part of RE: RE = r1 (unbypassed) + r2 (bypassed by CE). Gain ≈ RC ÷ (re + r1). It no longer depends much on temperature or the transistor\'s β, and it distorts less. Example: RC 560 Ω, re 5.2 Ω, r1 = 6.2 Ω → gain ≈ 49.'],
    ],
    tryit: ['Open the example (Preamp), tap MIC and set 60 Hz: CH1 gain falls from ≈ 109 to ≈ 77.', 'Then set CE to 1000 µF: the gain returns to ≈ 107.', 'Set MIC to 20 Hz with CE 100 µF: ≈ 35. That is why cheap amplifiers lose bass.', 'Calculator: the Capacitor tab gives Xc and fc for any value.'],
  },
  {
    id: 'delay555', title: '555 power-on delay', example: 'delay555', tag: 'Timer',
    intro: 'Turn the power on and the output waits about 1 second before switching ON. Used to delay a relay, a speaker (no "pop" at switch-on) or a motor until the supply is steady.',
    parts: [['U1', 'NE555 timer'], ['C1', '10 µF from +12 V to TRIG + THR'], ['R1', '100 kΩ from TRIG + THR to ground'], ['C2', '10 nF on CTRL (pin 5), noise filter'], ['R2 + ON', '1 kΩ + green LED on the output'], ['POWER', 'switch to try it']],
    steps: [
      ['1. How a 555 thinks', 'Inside are two comparators and a memory (latch). A divider of three 5 kΩ resistors makes ⅓ Vcc and ⅔ Vcc.<br><b>TRIG (pin 2) below ⅓ Vcc → output HIGH.</b> <b>THR (pin 6) above ⅔ Vcc → output LOW.</b> In between, it remembers the last state.'],
      ['2. The moment power comes on', 'C1 is empty, and an empty capacitor acts like a wire. So TRIG and THR jump up to the full 12 V with the supply. THR is above ⅔ Vcc (8 V) → <b>output LOW</b>, LED off.'],
      ['3. The wait', 'C1 now charges through R1. Its bottom end (TRIG + THR) slides down from 12 V toward 0 V with time constant τ = R1 × C1 = 100 kΩ × 10 µF = <b>1 s</b>.'],
      ['4. The switch', 'When TRIG drops below ⅓ Vcc (4 V), the output flips <b>HIGH</b> and stays there.<br>Time to fall from 12 V to 4 V: t = R × C × ln(3) = <b>1.1 × R × C ≈ 1.1 s</b>. The simulator switches at 1.09 s. ✔'],
      ['5. Changing the delay', 't ≈ 1.1 × R1 × C1. 470 kΩ + 10 µF ≈ 5 s, 1 MΩ + 47 µF ≈ 52 s. Keep R1 under about 1 MΩ (electrolytic leakage), and use a good capacitor for long delays.'],
      ['6. Driving a load', 'An NE555 output can source about 200 mA, so it drives an LED or a small 12 V relay straight away (add a 1N4148 across the coil). For anything bigger use a transistor or MOSFET. With an NE555 on 12 V the HIGH output is about 10.3 V (Vcc − 1.7 V); a TLC555 (CMOS) goes almost to 12 V.'],
      ['7. Fast reset when power goes off', 'After the delay C1 is full (12 V across it). When power is cut, its bottom end swings to about −12 V and C1 empties only slowly through R1, so a quick off-on gives a shorter delay.<br>Fix: a <b>1N4148 across R1, anode to ground, cathode to TRIG/THR</b>. While running it is reversed and does nothing; at switch-off it clamps the negative swing and empties C1 at once.'],
    ],
    tryit: ['Flip POWER on and watch the scope: blue = capacitor (TRIG/THR) falling, yellow = output stepping up after ≈ 1.1 s.', 'Change C1 to 47 µF: about 5 s.', 'Change the 555 to TLC555: the output HIGH goes to almost 12 V.', 'Flip POWER off and on again quickly: the delay is shorter because C1 did not empty. That is why the reset diode helps.'],
  },
  {
    id: 'fridge', title: 'Fridge / aircon guard (restart delay)', example: 'fridge', tag: 'Timer',
    intro: 'When power comes back after a brownout, the compressor must wait 3–5 minutes before starting. Right after it stops, the gas is still at high pressure on one side; restarting into that pressure stalls the motor, it draws locked-rotor current (5–8× normal) and the overload clicks or the winding cooks. This guard holds the relay off for ≈ 4 minutes every time power returns.',
    parts: [['U1', 'NE555 timer, 12 V'], ['C1', '220 µF / 25 V, low-leakage electrolytic, +12 V → TRIG + THR'], ['R1', '1 MΩ, TRIG + THR → ground'], ['D1', '1N4148 across R1 (cathode to TRIG/THR): fast reset'], ['C2', '10 nF on CTRL (pin 5)'], ['R2 + Q1', '1 kΩ + 2N2222 relay driver'], ['K1 + D2', '12 V relay coil + 1N4007 flyback diode'], ['FRIDGE', 'the load on the relay contacts (220 V in real life)'], ['MAINS', 'switch to fake power cuts']],
    steps: [
      ['1. Same trick as the power-on delay', 'Power on: C1 is empty, so TRIG/THR jump to 12 V → output LOW, relay off. C1 charges through R1, TRIG/THR slide down; below ⅓ Vcc (4 V) the output flips HIGH and the relay pulls in.<br>t ≈ 1.1 × R1 × C1 = 1.1 × 1 MΩ × 220 µF ≈ <b>242 s</b>. The simulator gets ≈ 220 s (the 555 inputs and D1 leak a little): <b>about 3.5–4 minutes</b>.'],
      ['2. Why D1 is the important part', 'After the delay C1 holds 12 V. When power drops, its bottom end is pushed to −12 V and C1 would empty only through R1 (minutes). Power back after 2 s → TRIG is already low → <b>the compressor restarts at once</b>, exactly what we wanted to stop.<br>D1 clamps that negative swing and empties C1 in milliseconds. Simulator: with D1, 2 s off → full ≈ 208 s wait again. Without D1 → restart after 0.1 s.'],
      ['3. Relay driver', 'NE555 HIGH ≈ 10.3 V → 1 kΩ → ≈ 9.6 mA base current. The 400 Ω coil needs 30 mA, so the 2N2222 is fully on (saturated). D2 catches the coil spike when it switches off.'],
      ['4. Choosing the relay', 'The contacts carry the compressor. A home fridge runs 1–1.5 A but starts at 6–10 A: use a <b>30 A / 250 VAC</b> relay (or a contactor for aircon). A 10 A cube relay welds its contacts after some months.'],
      ['5. Power supply', 'Any small 12 V supply from the mains (transformer + bridge + 1000 µF, or a 12 V SMPS module). Put a fuse on the 220 V side. Keep the 220 V tracks ≥ 3 mm away from the 12 V side on the PCB.'],
      ['6. Other times', '3 min: 1 MΩ + 150 µF. 5 min: 1 MΩ + 270 µF (or 1.2 MΩ + 220 µF). Don\'t go far above 1 MΩ: electrolytic leakage makes the time drift.'],
      ['7. What it does not do', 'This only delays restarts. It does not cut off low or high voltage. A full AVR / "fridge guard" adds a voltage sensor (zener + comparator) that also keeps the relay off outside ≈ 180–250 V.'],
    ],
    tryit: ['Flip MAINS on: blue = C1 (TRIG/THR) sliding down, yellow = FRIDGE voltage. At 10× speed the wait is ≈ 22 s; pick 60× to make it faster, 1× to see real time.', 'When FRIDGE is on, flip MAINS off and on again quickly: the full wait starts again.', 'Delete D1 and try the quick off/on: FRIDGE comes back almost at once. That is the compressor killer.', 'Change C1 to 22 µF for a quick 22 s test.'],
  },
  {
    id: 'buck', title: 'DC-DC buck converter (step-down)', example: 'buck', tag: 'Power',
    intro: 'A buck converter makes a lower DC voltage without burning the difference as heat (a 7805 or LM317 does). A switch chops the input fast, a coil + capacitor smooth it back to DC. Efficiency 85–95 %.',
    parts: [['VIN + CIN', '30 V supply + 100 µF input cap (very important on real boards)'], ['Q1', 'IRLZ44N high-side switch'], ['PWM + RG', '50 kHz gate drive, floating on the source (what a bootstrap driver does)'], ['D1', '1N5819 Schottky freewheel diode'], ['L1', '330 µH coil'], ['COUT', '47 µF output cap'], ['LOAD', '22 Ω']],
    steps: [
      ['1. Switch ON', 'Q1 connects 30 V to the coil. The coil current ramps up, feeding the load and charging COUT.'],
      ['2. Switch OFF', 'A coil refuses to stop its current. It pulls the switch node below 0 V until D1 conducts, and the current keeps flowing through D1 → L1 → load. That is why D1 must be a fast Schottky.'],
      ['3. The output', 'On average Vout = <b>duty × Vin</b>. 40 % × 30 V = 12 V; the simulator gets 11.7 V (diode + switch drops). Change PWM duty in its panel (float the panel to watch it live).'],
      ['4. Why real modules have feedback', 'Without feedback the output moves when Vin or the load changes. LM2596 / XL4015 / MP1584 modules measure Vout through a divider (the trimpot) into a 1.23 V or 0.8 V FB pin and adjust the duty by themselves.'],
      ['5. Choosing L and C', 'Ripple current ΔI = (Vin − Vout) × D ÷ (f × L) = 18 × 0.4 ÷ (50k × 330µ) ≈ 0.44 A p-p. Keep ΔI ≈ 20–40 % of the load current, and the coil\'s saturation current above the peak. The Inductor tab calculates this.'],
      ['6. When a buck "does not work"', '<b>Vout = Vin</b>: the switch is shorted (dead IC / MOSFET) or the trimpot is at the end. <b>Vout stuck low</b>: overload or short on the output, the chip is in current limit / thermal shutdown. <b>Won\'t go above Vin − 2 V</b>: dropout, a buck can never go above its input. <b>Trimpot does nothing</b>: 25-turn pots need 10–20 turns before anything moves. <b>Over 32 V in</b> kills an XL4015 / LM2596 (40 V absolute max).'],
    ],
    tryit: ['Change PWM duty to 20 % → ≈ 6 V, 60 % → ≈ 18 V.', 'Change LOAD to 220 Ω: Vout climbs to ≈ 19 V. The coil current now hits zero every cycle (discontinuous mode) and duty × Vin no longer holds. That is exactly why real bucks need feedback.', 'Change D1 to 1N4007 (slow, 0.7 V): efficiency drops.', 'Delete COUT and watch the ripple on the scope.'],
  },
  {
    id: 'buckreg', title: 'Regulated buck (like your 0–30 V → 0–20 V module)', example: 'buckreg', tag: 'Power',
    intro: 'The same power stage as the plain buck, plus the part every real module has: feedback. U1 keeps comparing the output with the voltage you set on RV1 and switches Q1 only as much as needed, so the output stays put when the load or the input changes.',
    parts: [['VIN + POWER', '24 V supply (0.5 Ω inside) and power switch'], ['Q1 + R1 + ZD1', 'IRF9540N P-MOSFET high-side switch. R1 holds it off, ZD1 keeps the gate within 12 V of the source'], ['Q2 + R2 + R3', '2N2222 pulls Q1\'s gate down = Q1 ON'], ['D1, L1, COUT', '1N5819, 100 µH, 220 µF: the buck itself'], ['RF1 / RF2', '30 k / 10 k feedback divider: FB ≈ Vout ÷ 4.3'], ['R5 + ZD2 + RV1', '5.1 V reference and the SET pot (your module\'s trimpot)'], ['CSS', '1 µF soft start: the setpoint rises slowly at power-on'], ['U1 + RAMP + R4', 'LM358 comparator with a small 50 kHz ramp added to FB'], ['LOAD / LOAD2', '22 Ω, plus 10 Ω you can switch on']],
    steps: [
      ['1. Flip POWER', 'CSS charges, the setpoint rises, and Vout follows up to ≈ 12 V in about 10 ms with no overshoot. That is what "soft start" does in a real chip.'],
      ['2. The loop', 'FB below the setpoint → U1 output HIGH → Q2 on → Q1\'s gate pulled down → Q1 ON, the coil current rises. FB above → Q1 OFF. The ramp on FB makes it switch in steady pulses instead of chattering.'],
      ['3. Setting the voltage', 'Vout ≈ 4.3 × the wiper voltage of RV1. 45 % ≈ 12 V, 10 % ≈ 19.5 V, 80 % ≈ 5 V, 100 % = 0 V. In your module the trimpot is in the divider (RF1) instead, with a fixed 1.23 V (LM2596) or 1.25 V (XL4015) reference. Same idea.'],
      ['4. Load and input changes', 'Flip LOAD2 ON (1.2 A more) or change VIN to 30 V: Vout stays within ≈ 0.3 V. The plain buck example jumped from 12 V to 19 V just from a lighter load.'],
      ['5. Why a P-MOSFET', 'The switch sits on the + side. A P-MOSFET turns on when its gate is pulled BELOW the source (Vin), so a simple transistor to ground can drive it. ZD1 is needed because Vin goes up to 30 V and MOSFET gates die above ≈ 20 V. Modules use an N-MOSFET inside the chip with a bootstrap capacitor (that is the extra cap on XL4015 boards).'],
      ['6. Limits your module also has', 'Vout can never go above Vin minus the drops (≈ 1–2 V here, 2–3 V in XL4015 modules). Set 20 V with VIN 18 V: Q1 just stays on and Vout ≈ 17 V. There is no current limit in this example; XL4015 limits at ≈ 5 A, LM2596 at ≈ 3 A.'],
    ],
    tryit: ['Flip POWER and watch Vout rise (scope CH2) with the switching node on CH1.', 'Change RV1 SET to 10 %: Vout ≈ 19.5 V. To 80 %: ≈ 5 V.', 'Flip LOAD2 ON: Vout dips a little and recovers.', 'Change VIN to 15 V and RV1 to 5 %: Vout tops out below 15 V (dropout).', 'Delete CSS, flip POWER off/on: the output overshoots at start-up.'],
  },
  {
    id: 'trouble', title: 'Troubleshooting: find the bad part with a meter', example: 'buckreg', tag: 'Repair',
    intro: 'Real repair work: something is dead, you have a multimeter. 🔍 Meter puts red and black probes anywhere on the drawing. 🔧 Fault (in any part\'s panel) breaks a part on purpose: open, shorted or weak. Break one, then find it by measuring, the way you would on the bench.',
    parts: [['🔍 Meter', 'toolbar button: tap = red probe, tap again = black probe. Reads red − black (DC volts)'], ['🔧 Fault', 'part panel: OK / open / shorted / weak. A red O or S (or yellow W) badge marks broken parts'], ['Example', 'the regulated buck (flip POWER first)']],
    steps: [
      ['1. Start from the input', 'Black probe on ground. Red on VIN, then after the POWER switch, then after each part along the path. The voltage should only drop where you expect it.'],
      ['2. OPEN part', 'An open part blocks current: the full voltage appears ACROSS it (red on one leg, black on the other) and everything after it reads 0 V. Burnt resistors, broken wires, blown fuses, dead switches.'],
      ['3. SHORTED part', 'A shorted part reads ≈ 0 V across it, even when it should be blocking. Blown MOSFETs and transistors usually short. Buck module with Vout = Vin? Measure across Q1: 0 V = shorted switch.'],
      ['4. Try it: shorted Q1', 'Set Q1 Fault = shorted, flip POWER: VOUT reads ≈ 23 V whatever RV1 says. Meter across Q1 (S and D): ≈ 0 V. That is the classic dead buck module.'],
      ['5. Try it: dead reference', 'Set ZD2 Fault = open: nothing holds the reference at 5.1 V, it rises with VIN and the output goes to ≈ 23 V (full on). Set it to shorted: reference 0 V, the output falls to a few volts whatever RV1 says. Measure the RV1 wiper to see why.'],
      ['6. Weak parts', 'Not everything dies completely: a dried capacitor (10 % left) gives more ripple, a resistor drifted ×5 shifts a divider, a weak battery sags under load. These need comparing with the expected value.'],
      ['Real-bench tips', 'Measure with the power ON for volts, OFF for resistance and continuity. A shorted part fools in-circuit resistance checks of its neighbours, so lift one leg if unsure. Electrolytic caps bulging on top = dried out.'],
    ],
    tryit: ['Break LOAD (open) in the plain LED example and find it.', 'SMPS: set U2 (opto) to open → output shoots up. Measure CTRL: stuck at ≈ 3.8 V (max duty).', 'Fridge guard: set D1 to open → fast off/on restarts the compressor at once.', 'Inverter: set Q2 shorted → huge battery current and the battery note warns.'],
  },
  {
    id: 'inverter', title: 'Inverter 12 V DC → 220 V AC', example: 'inverter', tag: 'Power',
    intro: 'A push-pull inverter: two MOSFETs take turns connecting each half of a center-tapped transformer to ground, 50 times a second. The transformer steps the 12 V square wave up to ≈ 220 V. This is how simple "modified sine" inverters work.',
    parts: [['BATT', '12 V battery'], ['OSC', '50 Hz oscillator (a CD4047, SG3525 or 555 in real life)'], ['Q1, Q2', 'IRFZ44N, 10 V gate'], ['Q3 + R3 + R4', 'inverts OSC so Q2 is ON when Q1 is OFF'], ['TR1', 'center-tap 10 + 10 : 190 turns (12-0-12 V : 230 V)'], ['LOAD', '220 V 60 W bulb']],
    steps: [
      ['1. Half 1', 'Q1 on: current flows +12 V → CT → P1 → Q1 → ground. The P1–CT half sees 12 V, the secondary gets 12 × 190 ÷ 10 ≈ <b>224 V</b>, one polarity.'],
      ['2. Half 2', 'Q2 on: current flows through the other half the other way round. The core\'s flux reverses, the secondary flips to −224 V. Repeat 50 times a second → AC.'],
      ['3. Why each MOSFET sees 24 V', 'While Q1 pulls P1 to 0 V, the transformer makes P2 go to 12 + 12 = <b>24 V</b>. Push-pull switches must stand 2× the battery voltage (plus spikes): use 55–100 V MOSFETs.'],
      ['4. Currents', '60 W ÷ 12 V ≈ <b>5 A</b> from the battery (simulator: 5.3 A). A 300 W inverter draws 25–30 A: thick wires, a fuse, and several MOSFETs in parallel.'],
      ['5. Square vs sine', 'Peak and RMS of a square wave are equal (224 V). Bulbs, heaters and most chargers are fine. Motors, fans and some appliances hum and run hot: pure sine inverters use 20 kHz PWM (SPWM) and an LC filter.'],
      ['6. Real-world must-haves', 'Dead time between Q1 and Q2 (never both on), a fuse, low-battery cutoff (10.5 V), and an RC snubber or TVS across each drain for the spikes the transformer\'s leakage inductance makes. <b>The output is lethal.</b>'],
    ],
    tryit: ['Change LOAD to 220 V 200 W: battery current ≈ 17 A.', 'Change BATT to 10.5 V (low battery): the output falls to ≈ 195 V.', 'Change TR1 secondary to 220 turns: ≈ 260 V out.', 'Tap TR1 to see magnetizing current; set OSC to 10 Hz and watch it climb (core saturation).'],
  },
  {
    id: 'tl494pwm', title: 'TL494: how the PWM chip works (10 kHz lamp dimmer)', example: 'tl494pwm', tag: 'Power',
    intro: 'The TL494 (clones: KA7500, KIA494) is the PWM controller inside old PC power supplies, many inverters and DC-DC converters. Inside: an oscillator that makes a sawtooth, two comparators that cut pulses from it, two error amplifiers, a 5 V reference and two output transistors. Here it dims a 12 V lamp at 10 kHz, and the DUTY knob sets the pulse width.',
    parts: [['U1', 'TL494, 12 V on VCC (pin 12)'], ['RT / CT', '10 kΩ / 10 nF: set the frequency'], ['DUTY', '10 kΩ pot from REF (5 V) to GND, wiper on DTC (pin 4)'], ['1IN± / 2IN±', 'error amps switched off: IN+ to GND, IN− to REF'], ['OC (pin 13)', 'to GND: both outputs switch together'], ['RG / RPD', '22 Ω gate resistor / 1 kΩ gate pull-down'], ['Q1 + LAMP', 'IRLZ44N MOSFET switching a 12 V 5 W lamp']],
    steps: [
      ['1. The sawtooth (oscillator)', 'The chip holds the RT pin at <b>3 V</b>. So the current out of RT is I = 3 V ÷ RT = 3 ÷ 10 000 = <b>0.0003 A = 0.3 mA</b> (tap U1: "RT current 300 µA").<br>The chip pushes that same 0.3 mA into CT. A capacitor charged by a steady current rises in a straight line: time to reach 3 V = C × ΔV ÷ I = 10 nF × 3 V ÷ 0.3 mA = 0.000 000 03 ÷ 0.0003 = <b>0.0001 s = 100 µs</b>. At 3 V the chip empties CT at once and the ramp starts again.'],
      ['2. Frequency = 1 ÷ (RT × CT)', 'Put step 1 together: time = CT × 3 V ÷ (3 V ÷ RT) = CT × 3 × RT ÷ 3. The two 3s cancel → <b>period = RT × CT</b>.<br>10 000 Ω × 0.000 000 01 F = 0.0001 s → f = 1 ÷ 0.0001 = <b>10 000 Hz = 10 kHz</b>. The simulator measures 9.99 kHz. ✔ (CH2 on the scope is this ramp.)'],
      ['3. The DUTY knob (dead-time control)', 'The pot is 10 kΩ from REF (5 V) to GND. At 70 % the wiper has 70 % of the track above it (7 kΩ) and 30 % below (3 kΩ): V(DTC) = 5 V × 3 kΩ ÷ 10 kΩ = <b>1.5 V</b>.<br>Inside, a comparator lets the outputs run only while the ramp is above DTC + 0.11 V (a built-in offset, so there is always a small gap). 1.5 + 0.11 = <b>1.61 V</b>.'],
      ['4. Pulse width from the ramp', 'The ramp climbs 3 V in 100 µs = 0.03 V per µs. It passes 1.61 V after 1.61 ÷ 0.03 = <b>53.7 µs</b>. From there to the end (100 µs) the output is ON: 100 − 53.7 = 46.3 µs.<br>Duty = 46.3 ÷ 100 = <b>46.3 %</b>. The simulator shows ≈ 47.5 % (it checks the ramp every 1.25 µs, so a pulse can come out up to one check longer).<br>In one line: <b>duty = (3 − V(DTC) − 0.11) ÷ 3</b>.'],
      ['5. The limits', 'DTC = 0 V (knob at 100 %): duty = (3 − 0 − 0.11) ÷ 3 = 2.89 ÷ 3 = <b>96.3 %</b>. It never reaches 100 %: that small gap is the minimum dead time (TI datasheet: ≈ 3 %).<br>Output fully OFF when V(DTC) ≥ 3 − 0.11 = <b>2.89 V</b>. The wiper gives 5 V × (1 − knob) ≥ 2.89 V → knob ≤ 1 − 2.89 ÷ 5 = 0.42 = <b>42 %</b>. So the first 42 % of the knob does nothing (try it). Fix: see "Try it".'],
      ['6. Error amps switched off', 'Each error amp compares IN+ with IN−. Here IN+ = 0 V (GND) and IN− = 5 V (REF): IN+ − IN− = −5 V, so its output sits at the bottom (0 V) and FEEDBACK (pin 3) stays ≈ 0 V.<br>The second comparator stops the pulses when the ramp is below FEEDBACK − 0.7 V = 0 − 0.7 = −0.7 V. The ramp is never below −0.7 V, so only DTC decides. In a power supply the error amp drives FEEDBACK instead, and the pulses shrink by themselves when the output voltage goes too high.'],
      ['7. Single-ended mode, emitter follower', 'OC (pin 13) on GND = both output transistors switch together, so E1 and E2 are joined for more drive. C1, C2 go to +12 V and the emitters drive the gate (emitter follower).<br>ON: gate = 12 V − 1.1 V (the chip transistor\'s Vce) = <b>10.9 V</b> (CH1 top). The IRLZ44N is fully on above 5 V, and 10.9 V is under its 16 V gate limit. ✔'],
      ['8. RPD and RG', 'An emitter follower can only push the gate UP. <b>RPD 1 kΩ</b> pulls it back down when the pulse ends. Its current while ON: 10.9 V ÷ 1000 Ω = <b>10.9 mA</b> (5.4 mA from each output), far under the 200 mA per output limit.<br><b>RG 22 Ω</b> limits the current spike that charges the MOSFET gate and stops ringing on long wires. 10–47 Ω is normal.'],
      ['9. The lamp', '12 V 5 W lamp: R = V² ÷ P = 12 × 12 ÷ 5 = <b>28.8 Ω</b>. While Q1 is ON: I = 12 ÷ 28.8 = <b>0.42 A</b>. Average power = 5 W × 0.475 = <b>≈ 2.4 W</b>: half brightness. At 10 kHz your eye sees no flicker.'],
    ],
    tryit: ['Turn DUTY from 100 % down to 42 %: the pulses on CH1 shrink, then stop (V(DTC) reaches 2.89 V).', 'Make the whole knob useful: put a 6.8 kΩ resistor between REF and the top of DUTY. The top of the pot is then 5 V × 10 k ÷ (6.8 k + 10 k) = 5 × 10 ÷ 16.8 = 2.98 V, so 0–100 % of the knob covers 96 % → 0 % duty.', 'Change CT to 4.7 nF: f = 1 ÷ (10 000 × 0.000 000 0047) = 1 ÷ 0.000 047 = 21.3 kHz (above hearing: silent for motors).', 'Move OC (pin 13) from GND to REF: push-pull mode, E1 and E2 take turns. Joined together they still give one pulse per ramp; the next article uses them separately.'],
  },
  {
    id: 'tl494inv', title: 'TL494 push-pull inverter 12 V → 220 V AC (50 Hz)', example: 'tl494inv', tag: 'Power',
    intro: 'The classic TL494 inverter: the chip gives Q1 and Q2 alternate pulses (push-pull), the MOSFETs drive the two halves of a center-tapped transformer, and the POWER knob on DTC sets how long each pulse lasts, which sets the output RMS voltage. Same idea as the "Inverter" example, but the TL494 makes both gate signals and the dead time.',
    parts: [['U1', 'TL494, OC (pin 13) on REF = push-pull'], ['RT / CT', '100 kΩ / 100 nF → 100 Hz oscillator'], ['POWER', '10 kΩ pot on DTC: pulse width / dead time'], ['R1, R2', '1 kΩ gate pull-downs'], ['Q1, Q2', 'IRFZ44N MOSFETs'], ['TR1', '10 + 10 : 190 turns center-tap transformer'], ['LOAD', '220 V 60 W lamp']],
    steps: [
      ['1. Oscillator 100 Hz', 'RT current = 3 V ÷ 100 000 Ω = 0.000 03 A = <b>30 µA</b>.<br>f = 1 ÷ (RT × CT) = 1 ÷ (100 000 × 0.000 000 1) = 1 ÷ 0.01 = <b>100 Hz</b>. One ramp = 1 ÷ 100 = <b>10 ms</b>.'],
      ['2. Push-pull halves it: 50 Hz', 'OC (pin 13) on REF = push-pull. A flip-flop inside gives ramp 1 to Q1, ramp 2 to Q2, ramp 3 to Q1… So each MOSFET gets every 2nd ramp: 100 ÷ 2 = <b>50 Hz</b>. Q1 ON → output +, Q2 ON → output −: one full AC cycle = 2 ramps = 20 ms. (That is why push-pull designs pick f = 2 × the output frequency.)'],
      ['3. POWER at 90 % → pulse width', 'V(DTC) = 5 V × (1 − 0.9) = <b>0.5 V</b> (the wiper has 10 % of the track below it). Threshold = 0.5 + 0.11 = <b>0.61 V</b>.<br>The ramp rises 3 V in 10 ms = 0.3 V per ms → it passes 0.61 V after 0.61 ÷ 0.3 = <b>2.03 ms</b>. Each pulse lasts 10 − 2.03 = <b>7.97 ms</b>.<br>Each MOSFET: 7.97 ms ON per 20 ms = 7.97 ÷ 20 = <b>39.8 %</b> (tap U1: ≈ 40–41 %). The 2.03 ms gaps with both OFF are the dead time: Q1 and Q2 can never be ON together.'],
      ['4. Output peak voltage', 'Each primary half has 10 turns, the secondary 190: ratio 190 ÷ 10 = <b>19</b>. While Q1 is ON the half sees ≈ 12 V → 12 × 19 = <b>228 V</b> peak. The MOSFET and winding resistance eat a little: the simulator shows <b>224 V</b>.'],
      ['5. RMS: what the knob really sets', 'The output is ±224 V during the pulses and 0 V in the gaps. Fraction of time ON = 2 pulses × 7.97 ms ÷ 20 ms = 15.94 ÷ 20 = <b>0.797</b>.<br>RMS of such a wave = peak × √(fraction) = 224 × √0.797 = 224 × 0.893 = <b>200 V</b> (simulator 200–203 V).<br>POWER at 100 % (DTC 0 V): fraction = (3 − 0.11) ÷ 3 = 0.963 → 224 × √0.963 = 224 × 0.981 = <b>220 V</b>. That is the "modified sine" trick: the peak stays ≈ 224 V, the gaps set the RMS.'],
      ['6. Gate drive', 'E1 → Q1 gate, E2 → Q2 gate, C1 and C2 on +12 V. ON: gate = 12 − 1.1 = <b>10.9 V</b>, enough for the IRFZ44N (fully on at 10 V). R1 / R2 (1 kΩ) pull each gate down between its pulses: 10.9 V ÷ 1000 Ω = <b>10.9 mA</b> while ON, under the 200 mA limit.'],
      ['7. Why each MOSFET sees 24 V', 'While Q1 holds P1 at 0 V, the transformer puts 12 V across the other half too, in the same direction: P2 = 12 + 12 = <b>24 V</b> (tap Q2: Vds ≈ 23.8 V). Use MOSFETs rated 55–100 V for the spikes on a real board.'],
      ['8. Next step: let the error amp hold 220 V', 'Real TL494 inverters feed a sample of the output into 1IN− and a fixed voltage (from REF) into 1IN+. Output too high → error amp output rises → FEEDBACK − 0.7 V climbs above the start of the ramp → shorter pulses → RMS drops back. The battery can sag from 12.6 to 11 V and the output stays ≈ 220 V.'],
      ['9. Low-battery cutoff with the 2nd error amp', 'Make an amp output go HIGH (pulses stop) when the battery is low: 2IN+ = 2.5 V (REF through two equal resistors: 5 × ½), 2IN− = battery through 33 kΩ (top) and 10 kΩ (bottom).<br>2IN− = Vbat × 10 ÷ (33 + 10) = Vbat × 0.2326. It drops below 2.5 V when Vbat < 2.5 ÷ 0.2326 = <b>10.75 V</b> → output HIGH → FEEDBACK HIGH → no pulses. Lead-acid batteries should not go below ≈ 10.5 V.'],
    ],
    tryit: ['Turn POWER from 90 % to 100 %: the gaps on CH1 shrink, RMS ≈ 200 → 220 V.', 'Turn POWER down to 60 %: V(DTC) = 2 V, pulses = (3 − 2.11) ÷ 3 = 0.297 of each ramp → RMS ≈ 224 × √0.297 = 224 × 0.545 = 122 V (simulator ≈ 128 V). The lamp dims, battery current falls from ≈ 4.4 A to ≈ 1.7 A.', 'Change CT to 47 nF: f = 1 ÷ (100 000 × 0.000 000 047) = 213 Hz → 106 Hz output (wrong for mains gear: keep RT × CT = 0.01 s for 50 Hz, 0.0083 s for 60 Hz).', 'Move OC (pin 13) from REF to GND: both MOSFETs switch ON together → the two halves cancel, the output is 0 V and the battery is shorted through the windings (hundreds of amps: the simulator flags SHORT CIRCUIT). That is why pin 13 must be on REF for push-pull.'],
  },
  {
    id: 'smps', title: 'Switching power supply 220 V AC → 5 V (flyback)', example: 'smps', tag: 'Power',
    intro: 'Every phone charger is a flyback converter: rectify the mains to ≈ 310 V DC, chop it at high frequency into a small transformer, rectify the secondary, and use an optocoupler to tell the primary side how much power to send. The transformer gives isolation and is tiny because of the high frequency.',
    parts: [['AC 220V', 'mains, 311 V peak'], ['D1–D4 + C1', 'bridge + 47 µF / 400 V bulk cap → ≈ 310 V DC'], ['Q1', 'IRFBC40 600 V MOSFET'], ['TR1', 'flyback transformer, primary 100 turns (10 mH) : 5 turns'], ['U1 + RAMP', 'PWM controller: sawtooth vs CTRL (inside a UC3842 / TL494 / Viper)'], ['D5 + C2', '1N5819 + 470 µF output'], ['R7, ZD1, U2', 'feedback: R7 + 3.3 V zener + PC817 opto (a TL431 in real chargers)'], ['R6, R8, C4', 'CTRL pull-up, max-duty limit (≈ 39 %), filter']],
    steps: [
      ['1. Rectify', 'Bridge + C1 turn 220 V AC into 220 × √2 ≈ <b>310 V DC</b>.'],
      ['2. Q1 ON: store', 'The primary gets 310 V, current ramps up in the transformer\'s inductance. The secondary is reversed (see the dots), so D5 blocks: energy is stored in the core, ½ × L × I².'],
      ['3. Q1 OFF: deliver', 'The flux can\'t stop, so the secondary voltage flips, D5 conducts and the stored energy goes into C2 and the load. The primary meanwhile sees 310 V + 20 × 5.4 V reflected ≈ <b>420 V</b> on Q1\'s drain. Hence the 600 V MOSFET (real ones also add an RCD snubber for the leakage spike).'],
      ['4. PWM controller', 'U1 compares the 0–10 V RAMP with CTRL: output high while RAMP < CTRL. CTRL 1.5 V → 15 % duty. R6 / R8 stop CTRL going above 3.9 V, so duty never exceeds ≈ 39 % (otherwise at start-up it would turn on 100 % and blow).'],
      ['5. Feedback through the opto', 'Above ≈ 5 V the opto LED starts conducting (3.3 V zener + 1.2 V LED + drop on R7). The more it glows, the more the opto transistor pulls CTRL down → shorter pulses → less power. That holds Vout at <b>5.0 V</b> whatever the load or mains voltage. The opto keeps the 5 V side isolated from the mains.'],
      ['6. Simulator vs real', 'Real chargers switch at 65–130 kHz with ≈ 1–2 mH; here 20 kHz so the simulator keeps up. In the simulator both grounds are joined (the solver needs one 0 V); in a real supply the 5 V side ground is NOT connected to the primary, and the primary side is lethal.'],
    ],
    tryit: ['Change LOAD to 10 Ω: CTRL drops, Vout stays ≈ 5 V.', 'Change AC 220V amplitude to 156 V (110 V AC): still close to 5 V, the loop just makes longer pulses.', 'Delete U2 (opto): no feedback, CTRL sits at the 39 % limit and Vout shoots up. That is what a dead opto / TL431 does to a charger.', 'Change ZD1 to 5.1 V: output ≈ 6.8 V.'],
  },
  {
    id: 'esp32io', title: 'ESP32 / Arduino pins: what is safe', example: 'esp32io', tag: 'Microcontroller',
    intro: 'The board part has no program: you set each pin the way your code would (OUTPUT HIGH, INPUT_PULLUP, analogRead…) and the simulator shows what the circuit around it does. Tap a pin on the drawing to set it.',
    parts: [['ESP32', 'DevKit 30-pin, USB powered, 3.3 V logic'], ['R1 + LED1', 'D23 OUTPUT HIGH → 330 Ω → red LED'], ['BTN', 'D15 INPUT_PULLUP, button to GND'], ['RV1', '10 kΩ pot on 3.3 V, wiper → D34 analogRead']],
    steps: [
      ['1. An output pin is a small battery with a resistor', 'OUTPUT HIGH ≈ 3.3 V (ESP32) or 5 V (UNO) through about 25–30 Ω inside. The more current you take, the more the voltage sags.<br>LED: (3.3 − 1.8) ÷ (330 + 30) ≈ <b>4 mA</b>. Keep each pin ≤ <b>20 mA</b> (40 mA is the absolute max). Bigger loads → transistor or MOSFET.'],
      ['2. Never more than the supply on a pin', '5 V on an ESP32 pin kills it. From a 5 V sensor use a divider (10 kΩ / 20 kΩ → 3.33 V) or a level shifter. The panel warns in red.'],
      ['3. Inputs need a defined level', 'An input with nothing on it "floats" and reads random HIGH/LOW. INPUT_PULLUP adds ≈ 45 kΩ (ESP32) / 35 kΩ (UNO) to the supply inside: the pin reads HIGH, and a button to GND pulls it LOW (pressed = LOW).'],
      ['4. HIGH and LOW thresholds', 'ESP32: LOW below ≈ 0.8 V, HIGH above ≈ 2.5 V. UNO: LOW below 1.5 V, HIGH above 3 V. In between the reading is unreliable.'],
      ['5. analogRead', 'ESP32: 12 bits, 0–4095 for 0–3.3 V (GPIO32–39 = ADC1; ADC2 pins don\'t work while WiFi is on). UNO: 10 bits, 0–1023 for 0–5 V on A0–A5.<br>Pot in the middle: 1.65 V → 2047.'],
      ['6. ESP32 pins to be careful with', '<b>GPIO34, 35, 36 (VP), 39 (VN)</b>: input only, no pull-ups. <b>GPIO0, 2, 5, 12, 15</b>: boot strapping, the wrong level at power-up stops booting or flashing (GPIO12 HIGH is the classic one). <b>TX0 / RX0</b>: USB serial.'],
      ['7. Power pins', 'ESP32 3V3 comes from its regulator (keep extra loads to a few hundred mA), VIN ≈ 4.7 V from USB. UNO 3V3 only 50 mA, 5V about 500 mA from USB. Motors, solenoids and relay banks need their own supply (common GND).'],
    ],
    tryit: ['Hold BTN: D15 reads LOW.', 'Turn RV1: D34 analogRead follows (0–4095).', 'Change R1 to 47 Ω: the D23 panel warns about the current.', 'Set D2 to PWM 50 %: the scope appears (time simulation).', 'Open 🟫 PCB: the DevKit footprint is ready for a carrier board.'],
    build: ['Parts: ESP32 DevKit (30 pin) + USB cable, 330 Ω resistor, red LED, push button, 10 kΩ pot, breadboard, jumper wires.', 'LED: D23 → 330 Ω → LED long leg (+); LED short leg (−) → GND.', 'Button: D15 → button → GND (no resistor: INPUT_PULLUP is inside).', 'Pot: outer legs to 3V3 and GND, middle leg (wiper) → D34.', 'Arduino IDE → board "ESP32 Dev Module" → upload the code below → Serial Monitor at 115200.'],
    code: "const int LED = 23;\nconst int BTN = 15;\nconst int POT = 34;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n  // D34 is input-only: analogRead works without pinMode\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  int pot = analogRead(POT);    // 0 ... 4095\n  digitalWrite(LED, pressed ? LOW : HIGH);   // LED on, off while pressed\n  Serial.print(\"button: \"); Serial.print(pressed ? \"PRESSED\" : \"up\");\n  Serial.print(\"   pot: \"); Serial.println(pot);\n  delay(200);\n}",
    note2: 'Pins set by hand stay as you set them, so the LED does not react to the button by itself. To make it react: tap the ESP32 → 💻 Code → pick "Button → LED + Serial" → ▶ Run code. Now hold BTN and watch D23 and the serial monitor, exactly like the real board.',
  },
  {
    id: 'lcd', title: 'LCD 16×2 with I2C (4 wires)', example: 'lcd', tag: 'Microcontroller',
    intro: 'The classic blue / green 16×2 LCD with the small I2C "backpack" (PCF8574) needs only 4 wires: GND, VCC, SDA, SCL. The ESP32 reads a pot and prints its voltage. The code is already running: tap the ESP32 → 💻 Code to see it.',
    parts: [['ESP32', 'SDA = GPIO21, SCL = GPIO22'], ['LCD1', '16×2 LCD + PCF8574 backpack, address 0x27'], ['RV1', '10 kΩ pot on 3.3 V → GPIO34']],
    steps: [
      ['1. Wiring', 'LCD GND → GND, VCC → 5 V (ESP32 VIN pin, UNO 5V), SDA → GPIO21 (UNO A4), SCL → GPIO22 (UNO A5). The backpack already has the I2C pull-up resistors.'],
      ['2. The library', 'Arduino IDE → Library Manager → "LiquidCrystal I2C" (Frank de Brabander). lcd.init() once, lcd.backlight(), then setCursor(column, row) and print(). Columns 0–15, rows 0–1.'],
      ['3. Address', 'Most backpacks are 0x27, the PCF8574A ones 0x3F. Wrong address = the screen shows only a row of boxes. Change it in the LCD panel to try.'],
      ['4. 5 V LCD on a 3.3 V ESP32', 'Powering the LCD from 5 V is right (at 3.3 V the text is very faint). The pull-ups then go to 5 V; the ESP32 pins usually survive it, but the clean way is a level shifter or removing the backpack pull-ups and adding 4.7 kΩ to 3.3 V.'],
      ['5. Leftover characters', 'print() only overwrites where it writes. "Pot: 1.98 V" followed by "Pot: 2 V" leaves a stray "V". Hence the extra spaces after " V   " in the code.'],
    ],
    tryit: ['Turn RV1: the LCD follows.', 'Change the LCD address to 0x3F: boxes only (address mismatch).', 'Delete the SCL wire: boxes only.', 'Edit the code: lcd.setCursor(0, 0); lcd.print("Hello migo!"); and ▶ Run code again.'],
  },
  {
    id: 'oled', title: 'OLED 0.96" 128×64 (SSD1306, I2C)', example: 'oled', tag: 'Microcontroller',
    intro: 'The small 0.96" OLED is 128 × 64 dots you switch on one by one: text in any size, lines, boxes, circles, bitmaps and graphs. Only 4 wires (GND, VCC, SCL, SDA). The ESP32 shows the pot voltage as a number, a bar and a moving graph. The code is running: tap the ESP32 → 💻 Code.',
    parts: [['ESP32', 'SDA = GPIO21, SCL = GPIO22'], ['OLED1', '0.96" SSD1306 module, address 0x3C, yellow / blue'], ['RV1', '10 kΩ pot on 3.3 V → GPIO34']],
    steps: [
      ['1. Wiring', 'OLED GND → GND, VCC → 3.3 V or 5 V (the module has its own regulator), SCL → GPIO22 (UNO A5), SDA → GPIO21 (UNO A4). Read the print on your module: some have GND and VCC swapped.'],
      ['2. The libraries', 'Arduino IDE → Library Manager → "Adafruit SSD1306" (it asks to add "Adafruit GFX" too: say yes). display.begin(SSD1306_SWITCHCAPVCC, 0x3C) once in setup().'],
      ['3. Draw, then display()', 'Everything you draw (print, drawLine, fillRect…) goes into a 1 KB buffer in the board\'s RAM. The screen only changes when you call display.display(). The usual loop: clearDisplay() → draw everything → display().'],
      ['4. Coordinates', 'x = 0…127 left → right, y = 0…63 top → bottom. Text size 1 = 6 × 8 dots per letter (21 letters × 8 lines), size 2 = 12 × 16, size 3 = 18 × 24.'],
      ['5. Yellow / blue modules', 'The top 16 rows are yellow, the rest blue: it is the same chip, just two colours of glass. Put the title in rows 0–15.'],
      ['6. Handy commands', 'setTextSize(n) · setTextColor(SSD1306_WHITE) · setCursor(x, y) · print / println · drawPixel · drawLine · drawRect / fillRect · drawCircle / fillCircle · drawRoundRect · drawTriangle · drawBitmap · invertDisplay(true) · setRotation(0–3).'],
    ],
    tryit: ['Turn RV1: number, bar and graph follow.', 'Change the OLED address to 0x3D: the screen stays black (address mismatch).', 'Delete display.display(); at the end of loop(): the picture freezes.', 'Add display.drawCircle(110, 50, 10, SSD1306_WHITE); before display.display(); and watch it appear.', 'Change the colour in the OLED panel to white or blue.'],
  },
  {
    id: 'encoder', title: 'Rotary encoder + interrupts (menu on the OLED)', example: 'encoder', tag: 'Microcontroller',
    intro: 'A rotary encoder is a knob that turns forever in clicks and can be pushed. It is the classic way to set a value or walk through a menu. Here the ESP32 reads it with an interrupt and shows a menu on the OLED: turn to move, push to choose. Tap the knob on the drawing: left half ⟲, right half ⟳, middle = push.',
    parts: [['ENC1', 'KY-040 module: CLK → GPIO32, DT → GPIO33, SW → GPIO25, + → 3V3'], ['OLED1', 'SSD1306 menu screen (GPIO21 / 22)'], ['LED1 + R1', 'LED on GPIO23 through 330 Ω']],
    steps: [
      ['1. How it works', 'Inside are two switches, A (CLK) and B (DT), that both close and open once per click, a little after each other. Turning right, CLK goes LOW first; turning left, DT goes LOW first. That order (quadrature) tells the direction.'],
      ['2. Reading the direction', 'At the moment CLK falls, look at DT: still HIGH = DT has not moved yet = turned right (count + 1). Already LOW = turned left (count − 1).'],
      ['3. Why an interrupt', 'One click is over in a few milliseconds. If loop() is busy (drawing the OLED, delay()), polling misses clicks. attachInterrupt(digitalPinToInterrupt(CLK), readEncoder, FALLING) makes the board stop whatever it is doing and run readEncoder() the instant CLK falls.'],
      ['4. ISR rules', 'Keep it tiny: read a pin, change a number, return. No delay(), no Serial, no display inside. Variables shared with loop() must be volatile. On the ESP32 mark it IRAM_ATTR. In loop(), copy the count between noInterrupts() and interrupts() so it cannot change halfway.'],
      ['5. Which pins', 'ESP32: any GPIO can interrupt. UNO: only D2 (interrupt 0) and D3 (interrupt 1): put CLK on D2. Modes: RISING, FALLING, CHANGE, LOW (and HIGH on the ESP32).'],
      ['6. The push button', 'SW connects to GND when pushed and the KY-040 has no pull-up for it: pinMode(SW, INPUT_PULLUP). Act once per press by remembering the last state (wasPressed), otherwise one push counts many times.'],
      ['7. Real knobs bounce', 'A real encoder\'s contacts chatter for about 1 ms, giving extra counts. The KY-040 already has the pull-ups; add 100 nF from CLK and DT to GND, or ignore a second edge within 2 ms (millis()). The simulator\'s contacts are clean.'],
    ],
    tryit: ['Turn right 2 clicks, push: Blink ON, the LED blinks.', 'Move to Speed, push, turn: the blink speed changes; push again to leave.', 'Change FALLING to CHANGE in the code: every click now counts twice (CLK falls and rises).', 'Swap the CLK and DT wires: the menu moves the other way.', 'Delete the attachInterrupt line: the menu stops moving.'],
  },
  {
    id: 'sr595sig', title: '74HC595 by hand: signal generators on SER and SRCLK', example: 'sr595sig', tag: 'Digital',
    intro: 'No microcontroller: one signal generator is the data (SER), another the clock (SRCLK). Watch the bits walk along the 8 LEDs, one step per clock. The scope shows CH1 = clock, CH2 = data.',
    parts: [['CLK', 'square wave 0 / 5 V, 2 Hz → SRCLK (pin 11) and RCLK (pin 12)'], ['SER', 'square wave 0 / 5 V, 0.3 Hz → SER (pin 14)'], ['U1', '74HC595 on 5 V: SRCLR (10) to 5 V, OE (13) to GND'], ['QA … QH', '8 LEDs, each through 330 Ω']],
    steps: [
      ['1. The clock', 'CLK = 2 Hz: 2 rising edges per second, one every 1 ÷ 2 = <b>0.5 s</b>. Each rising edge = one shift.'],
      ['2. The data', 'SER = 0.3 Hz: one period = 1 ÷ 0.3 = 3.33 s, half HIGH (1.67 s), half LOW. 1.67 s ÷ 0.5 s per clock ≈ <b>3–4 clocks</b> read a 1, then 3–4 clocks read a 0. That is why groups of 3–4 lit LEDs walk along.'],
      ['3. What one clock does', 'On the rising edge of SRCLK the chip reads SER right then: that bit goes into QA, the old QA moves to QB, QB to QC … QH out to QH\' (pin 9, for a next chip). SER may change any time between clocks: only its level at the edge counts.'],
      ['4. RCLK tied to SRCLK', 'Here the latch clock is the same wire as the shift clock. At each edge the outputs copy the shift register as it was <b>just before</b> that shift, so the LEDs run one step behind the inside. With a microcontroller you pulse RCLK once after all 8 shifts instead, so all LEDs change together.'],
      ['5. Why 5 V on SRCLR and GND on OE', 'SRCLR (pin 10) LOW = clear everything: keep it HIGH. OE (pin 13) HIGH = all outputs off: keep it LOW. Both are "active LOW" pins, marked with a bar over the name in datasheets.'],
      ['6. LED resistors', 'Output HIGH ≈ 5 V, red LED ≈ 2 V: (5 − 2) ÷ 330 Ω = 0.009 A = <b>9 mA</b> per LED. 8 LEDs = 72 mA total, the 74HC595 allows 70 mA for the whole chip: right at the limit, so 470 Ω–1 kΩ is safer on a real board.'],
    ],
    tryit: ['Change SER to 1 Hz: the groups get shorter (1 lit, 1 dark: 0.5 s HIGH = 1 clock).', 'Change CLK to 5 Hz: the bits run faster.', 'Change SER duty to 10 %: single lit LEDs walk along.', 'Unhook RCLK from the clock (delete the short wire) : the LEDs stop updating, even though the bits keep shifting inside (tap U1: "Shift register" keeps changing).'],
  },
  {
    id: 'relay10', title: '10 relays on 3 wires: 74HC595 shift registers in a chain', example: 'relay10', tag: 'Microcontroller',
    intro: 'Ten relay modules would need ten GPIO pins. A 74HC595 shift register turns 3 pins into 8 outputs, and chips can be chained (cascaded) for 16, 24, 32… outputs on the same 3 pins. Here an ESP32 drives two of them for 10 relay modules, and you switch the relays by typing in the Serial box: 3, on 3, off 3, all on, all off, or a binary pattern like 1000000001.',
    parts: [['ESP32', 'GPIO19 → SER, GPIO18 → SRCLK, GPIO5 → RCLK, GPIO4 → OE'], ['U1, U2', '74HCT595, U1 QH\' (pin 9) → U2 SER (pin 14)'], ['RLY1–RLY10', '5 V relay modules, LOW trigger (IN LOW = ON)'], ['PSU', '5 V supply for the chips and relays, GND shared with the ESP32']],
    steps: [
      ['1. How many chips', 'One 74HC595 has 8 outputs (QA … QH). 10 relays need more than 8, so 2 chips: 10 ÷ 8 = 1.25 → round up = <b>2</b>. Chip 1 drives relays 1–8, chip 2 relays 9–10 (its other 6 outputs stay free for later).'],
      ['2. The 3 wires', '<b>SER</b> (pin 14) = the data bit. <b>SRCLK</b> (pin 11) = shift clock: on every rising edge the chip takes the SER bit into QA and moves QA → QB → … → QH → QH\'. <b>RCLK</b> (pin 12) = latch: on its rising edge all outputs copy the shifted bits at the same moment, so the relays never flicker while bits are moving.'],
      ['3. The cascade', 'QH\' (pin 9) of chip 1 → SER of chip 2. SRCLK and RCLK go to both chips. After 16 clock pulses the first byte sent has walked through chip 1 into chip 2. That is why the code sends the <b>last chip\'s byte first</b>: shiftOut((out >> 8) & 0xFF) then shiftOut(out & 0xFF).'],
      ['4. One number = all relays', 'The sketch keeps one number, relays: bit 0 = relay 1 … bit 9 = relay 10. 1 << 2 = binary 100 = relay 3. relays |= (1 << 2) turns relay 3 ON, relays &= ~(1 << 2) OFF, relays ^= (1 << 2) toggles. All ON = (1 << 10) − 1 = 1023 = ten 1s.'],
      ['5. LOW trigger', 'Most relay modules switch ON when IN is LOW (the opto LED inside lights when current flows from VCC into IN). So the code flips every bit before sending: out = ~relays. 1 (ON) becomes 0 = LOW = relay ON.'],
      ['6. 74HC or 74HCT', 'At 5 V a 74HC595 needs at least 0.7 × VCC = 0.7 × 5 = <b>3.5 V</b> for a HIGH. An ESP32 pin gives only 3.3 V: below 3.5, so the chip may not see it. A 74HCT595 needs only <b>2.0 V</b>: 3.3 V is plenty. So: ESP32 + 5 V relays → 74HCT595. (Arduino UNO is 5 V: the plain 74HC595 is fine.)'],
      ['7. Why 5 V for the chip', 'The relay module turns OFF only when IN is close to its VCC (5 V). A chip running at 3.3 V gives at most 3.3 V on IN: 5 − 3.3 = 1.7 V still across the opto LED, so the relay may stay ON. Running the 595 at 5 V gives a full 5 V HIGH.'],
      ['8. Power', 'Each relay coil takes ≈ 70 mA (5 V ÷ 70 Ω coil). 10 relays ON = 10 × 70 mA = <b>0.7 A</b>. The ESP32 VIN / USB cannot give that safely: use a 5 V 1 A (or bigger) supply and connect its GND to the ESP32 GND. The 595 itself only gives ≈ 3 mA per IN pin, well under its 35 mA per pin limit.'],
      ['9. Power-up clicks', 'At power-on a 595 can start with random outputs for a moment, so some relays may click. On the real board: tie OE (pin 13) to VCC with a 10 kΩ and wire it to a GPIO; in setup() first send all OFF, then digitalWrite(OE_PIN, LOW). SRCLR (pin 10) to VCC.'],
      ['10. Switching them', 'Easiest: tap the ESP32 or any relay module. The <b>🔌 Relays</b> box is at the top of its panel (also in the 🪟 Float window). Tap numbers to select them (blue), then <b>⚡ ON selected</b>, <b>OFF selected</b>, or <b>Only selected</b> (selected ON, all the others OFF). All ON / All OFF switch everything. A red dot = that relay is really ON.<br><b>⏱ Reset time</b>: type seconds and Set. Each relay then switches itself OFF that long after it went ON (like a staircase timer). 0 = stays ON.<br>Or type in the Serial box: 3 (toggle) · on 1,3,5 · off 2,4 · all on · all off · 1000000001 · time 5.'],
      ['11. OE on GPIO4 (no clicks at power-on)', 'OE (pin 13) of both chips goes to GPIO4. setup() first sets OE HIGH (outputs off = every relay OFF), loads "all OFF", then sets OE LOW. On the real board also put a <b>10 kΩ from OE to 3.3 V</b>: while the ESP32 boots its pins float, the resistor keeps OE HIGH, so no relay clicks.'],
      ['12. Build it for real: phone control', 'The real firmware (Fox9nerRelays.ino) uses this same wiring and the same commands, plus <b>Bluetooth</b> and <b>WiFi</b>. Arduino IDE: board ESP32 Dev Module, Partition Scheme <b>Huge APP</b> (Bluetooth + WiFi need the space), library "WebSockets" by Markus Sattler.<br>Bluetooth: open <a href="relays.html" target="_blank">relays.html</a> in Chrome (Android) → Connect → "Fox9ner Relays". iPhone: Bluefy app.<br>WiFi: same network (or the ESP32 hotspot "Fox9ner-Relays"), open http://relays.local.'],
    ],
    tryit: ['Watch the start-up test: relays 1 → 10 click one after the other.', 'Send 1010101010 and then 0101010101.', 'Change U1 to 74HC595 in its panel: the ESP32\'s 3.3 V is now in the "don\'t know" zone and the panel warns you.', 'Delete the wire from U1 QH\' to U2 SER: relays 9 and 10 never change.', 'In the code, swap the two shiftOut lines: relays 1–8 and 9–16 trade places (watch which relays follow).'],
  },
  {
    id: 'seg7', title: '7-segment display counter', example: 'seg7', tag: 'Microcontroller',
    intro: 'A 7-segment display is 8 LEDs (a–g + dot) sharing one common pin. The UNO lights the right segments for each digit from a table of bits. The code is running: tap the UNO → 💻 Code.',
    parts: [['UNO', 'D2 … D9 → segments a, b, c, d, e, f, g, dp'], ['DS1', 'common cathode 0.56" display (5161AS)'], ['R1', '330 Ω on the common pin']],
    steps: [
      ['1. Common cathode vs anode', 'CC: the common pin goes to GND, a HIGH segment pin lights. CA: common to +5 V, a LOW lights. Set the type in the DS1 panel; the code must match.'],
      ['2. The digit table', 'Each digit is one byte: bit 0 = a … bit 6 = g. 0 = 0x3F (a–f on), 1 = 0x06 (b, c), 8 = 0x7F (all). show(n) writes bit i of DIGITS[n] to segment pin i.'],
      ['3. One resistor or eight', 'One 330 Ω on the common pin is the lazy way: the current is shared, so "1" (2 segments, ≈ 4.6 mA each) is brighter than "8" (7 segments, ≈ 1.4 mA). Watch the segment current in the DS1 panel. Proper way: 220–330 Ω in each segment line.'],
      ['4. PCB', 'The footprint is the common 10-pin 0.56" layout: top 10 g · 9 f · 8 COM · 7 a · 6 b, bottom 1 e · 2 d · 3 COM · 4 c · 5 dp. Check your display\'s datasheet; some clones differ.'],
    ],
    tryit: ['Watch digit 1 vs 8: brightness changes (one shared resistor).', 'Change R1 to 47 Ω: the panel warns about segment current.', 'Change DS1 to common anode without changing the code: dark (wrong type).', 'Make it count down: for (int n = 9; n >= 0; n--).'],
  },
  {
    id: 'doorlock', title: 'Keypad door lock (ESP32 + 12 V solenoid)', example: 'doorlock', tag: 'Project',
    intro: 'A complete door lock: type the PIN on the 4×4 keypad, the LCD shows ****, # checks it. Right PIN: the MOSFET powers the 12 V solenoid for 3 s and the buzzer beeps. Wrong PIN: long beep. The code is running: tap the keys on the drawing (PIN 1234 then #).',
    parts: [['ESP32', 'runs the sketch (💻 Code)'], ['KEYPAD', '4×4 membrane keypad: rows → GPIO 19, 18, 5, 17 · columns → 16, 4, 2, 15'], ['LCD1', '16×2 I2C: SDA 21, SCL 22, VCC from VIN (5 V)'], ['BUZZER', 'active buzzer on GPIO23'], ['Q1 + R1 + R2', 'IRLZ44N logic-level MOSFET, 100 Ω gate resistor, 10 kΩ pull-down (lock stays shut while the ESP32 boots)'], ['LOCK + D1', '12 V 0.5 A solenoid lock, 1N5819 across it for the switch-off spike'], ['12V', '12 V 1 A adapter (the ESP32 needs its own 5 V: a buck module from the 12 V, or USB)']],
    steps: [
      ['1. How the keypad works', 'The 16 keys sit where 4 row wires cross 4 column wires. The Keypad library drives one row at a time and reads the columns: pressed key = that row + that column connected. No resistors needed (it uses the internal pull-ups).'],
      ['2. The PIN logic', 'Each key is added to the String typed and a * goes to the LCD. # compares typed with code ("1234"). * clears. Change the PIN in the code: String code = "1234";'],
      ['3. Driving the lock', 'The lock coil needs 12 V × 0.5 A; an ESP32 pin gives 3.3 V × 20 mA. The IRLZ44N is fully on at 3.3 V on its gate, so the pin switches the lock through it. R2 keeps the gate at 0 V during boot (no unlocking at power-up!).'],
      ['4. Why D1', 'Switching off a coil makes a big voltage spike (L × dI/dt). D1 gives the current a path and protects the MOSFET. Delete D1 and watch the drain voltage jump.'],
      ['5. Making it real', 'Fail-secure lock (locked without power) for a cabinet, fail-safe (open without power) for a door people must exit. Add a "door open" switch on a free pin, and store the PIN in Preferences / EEPROM so it survives a power cut.'],
    ],
    tryit: ['Type 1234 # : LCD "OPEN - welcome!", the lock turns green for 3 s, beep.', 'Type a wrong PIN: "WRONG PIN" and a long beep.', 'Change String code = "2580"; (edit while running: it restarts by itself).', 'Set Q1 Fault = shorted: the lock is always open. That is a blown MOSFET.', 'Open 🟫 PCB: the keypad gets an 8-pin header, the lock a screw terminal.'],
  },
  {
    id: 'unoio', title: 'Arduino UNO: LED, button, pot', example: 'unoio', tag: 'Microcontroller',
    intro: 'The same idea as the ESP32 page on a 5 V board: D13 drives an LED, D2 reads a button with the internal pull-up, A0 reads a pot.',
    parts: [['UNO', 'Arduino UNO, USB powered, 5 V logic'], ['R1 + LED1', 'D13 OUTPUT HIGH → 220 Ω → red LED'], ['BTN', 'D2 INPUT_PULLUP, button to GND'], ['RV1', '10 kΩ pot on 5 V, wiper → A0']],
    steps: [
      ['LED current', '(5 − 1.8) ÷ (220 + 25) ≈ <b>12.5 mA</b> (the simulator shows 12.4 mA). Under the 20 mA a pin likes. D13 also has the small on-board "L" LED.'],
      ['Button', 'INPUT_PULLUP (≈ 35 kΩ inside) holds D2 at 5 V = HIGH. Pressed → 0 V = LOW. D0 and D1 are the USB serial pins: keep them free.'],
      ['Pot', 'A0 reads 0–1023 for 0–5 V. Middle = 2.5 V → about 511.'],
      ['PWM', 'Only D3, D5, D6, D9, D10, D11 (marked ~) can do analogWrite.'],
    ],
    tryit: ['Hold BTN: D2 reads LOW.', 'Turn RV1: A0 follows 0–1023.', 'Change R1 to 100 Ω: about 26 mA, the D13 panel warns.', 'Set D9 to PWM and add an LED + 220 Ω: dimming.'],
    build: ['Parts: Arduino UNO + USB cable, 220 Ω resistor, red LED, push button, 10 kΩ pot, breadboard, jumper wires.', 'LED: D13 → 220 Ω → LED long leg (+); LED short leg (−) → GND.', 'Button: D2 → button → GND.', 'Pot: outer legs to 5V and GND, middle leg → A0.', 'Arduino IDE → board "Arduino Uno" → upload → Serial Monitor at 9600.'],
    code: "const int LED = 13;\nconst int BTN = 2;\nconst int POT = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);   // pressed = LOW\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BTN) == LOW;\n  int pot = analogRead(POT);    // 0 ... 1023\n  digitalWrite(LED, pressed ? LOW : HIGH);   // LED on, off while pressed\n  Serial.print(\"button: \"); Serial.print(pressed ? \"PRESSED\" : \"up\");\n  Serial.print(\"   pot: \"); Serial.println(pot);\n  delay(200);\n}",
    note2: 'In the simulator no program runs: pins stay as you set them. On the real board the code reads D2 and switches D13.',
  },
  {
    id: 'servo', title: 'Servo motor (SG90 / MG996R)', example: 'servo', tag: 'Motor',
    intro: 'A hobby servo turns its arm to an angle set by the length of a pulse that repeats every 20 ms. Inside: a small motor, gears, a potentiometer and a little control board that keeps the arm where the pulse says.',
    parts: [['ESP32', 'D18 = PWM 50 Hz'], ['SERVO', 'SG90: SIG (orange), V+ (red), GND (brown)'], ['Power', 'servo V+ from VIN (USB 5 V)']],
    steps: [
      ['1. The pulse', 'Every 20 ms (50 Hz) one pulse: <b>0.5 ms = 0°</b>, <b>1.5 ms = 90°</b>, <b>2.5 ms = 180°</b>. Some servos use 1–2 ms for 0–180°: check yours.'],
      ['2. As PWM duty', 'Duty = pulse ÷ 20 ms: 2.5 % = 0°, 7.5 % = 90°, 12.5 % = 180°. Angle = (pulse − 0.5 ms) ÷ 2 ms × 180°.'],
      ['3. Power', 'Servos want 5–6 V and pull 250 mA (SG90) to 2.5 A (MG996R, stall) while moving. Never from the 3.3 V pin. One SG90 from VIN/USB is OK; bigger or several servos → separate 5–6 V supply, GND joined with the ESP32.'],
      ['4. 3.3 V signal', 'The ESP32\'s 3.3 V pulse is enough for almost all servos even when they run on 5 V.'],
    ],
    tryit: ['Tap the ESP32, pick D18, set Duty to 2.5 % → the arm swings to 0°. 12.5 % → 180°.', 'Watch the arm move at the servo\'s real speed (about 0.1 s per 60° for an SG90).', 'Change the servo to MG996R: the panel warns about its stall current.'],
    build: ['Parts: ESP32 DevKit, SG90 servo, USB cable (for big servos: 5–6 V 2 A supply).', 'Servo orange / yellow → D18.', 'Servo red → VIN (or + of the 5–6 V supply).', 'Servo brown / black → GND (and − of the supply: common ground!).', 'Arduino IDE → install the library "ESP32Servo" → upload.'],
    code: "#include <ESP32Servo.h>   // Library Manager: \"ESP32Servo\"\n\nServo servo;\n\nvoid setup() {\n  servo.attach(18, 500, 2500);   // pin, 0.5 ms = 0\u00b0, 2.5 ms = 180\u00b0\n}\n\nvoid loop() {\n  servo.write(0);   delay(1000);\n  servo.write(90);  delay(1000);\n  servo.write(180); delay(1000);\n}",
    note2: 'In the simulator you set the PWM duty by hand; on the real board servo.write(angle) makes the same pulse.',
  },
  {
    id: 'stepper', title: 'Stepper motor with an A4988 driver', example: 'stepper', tag: 'Motor',
    intro: 'A stepper turns a fixed angle for every pulse: 1.8° for a NEMA 17, so 200 pulses = 1 turn. The A4988 driver does the hard part (switching coil currents); the microcontroller only gives STEP and DIR.',
    parts: [['ESP32', 'D18 = STEP (PWM 200 Hz), D5 = DIR (HIGH)'], ['A4988', 'VDD from 3V3, EN open = on, RST + SLP joined'], ['Motor', 'NEMA 17, 200 steps per turn'], ['VMOT', '12 V supply + 100 µF capacitor at the module']],
    steps: [
      ['1. Speed', '<b>RPM = step rate × 60 ÷ (200 × microsteps)</b>. 200 steps/s, full step → 60 RPM. The simulator shows 60 RPM. ✔'],
      ['2. Direction', 'DIR HIGH = one way, LOW = the other. Change DIR only while STEP is not pulsing.'],
      ['3. Microstepping', 'MS1–MS3 pins: 1/2, 1/4, 1/8, 1/16 steps. Smoother and quieter, but you need more pulses for the same speed.'],
      ['4. Current limit (important!)', 'Set it on the module\'s trimpot before connecting the motor: Vref = I × 8 × Rsense. With Rsense 0.1 Ω (common): Vref = 0.8 × I. For 1 A → 0.8 V. Too high = hot driver and motor. Above about 1.2 A use a heatsink.'],
      ['5. Power', 'VMOT 8–35 V (12 V typical) with a 100 µF electrolytic right at the module: voltage spikes from the motor can kill the A4988. Never unplug the motor while powered.'],
      ['6. Wiring the coils', 'The two coils go to 1A/1B and 2A/2B. Find the pairs with a multimeter: two wires that beep (a few Ω) are one coil.'],
    ],
    tryit: ['Tap the ESP32, pick D18 and change the PWM frequency: 400 Hz → 120 RPM.', 'Set D5 to OUTPUT LOW: the rotor turns the other way (negative RPM).', 'Tap the stepper and choose 1/16 microstep: same pulses, 16× slower.', 'Set the VMOT battery to 6 V: the driver shuts down (below 8 V).'],
    build: ['Parts: ESP32 DevKit, A4988 module (+ heatsink), NEMA 17 stepper, 12 V 2 A supply, 100 µF 25 V capacitor.', 'A4988 STEP → D18, DIR → D5, VDD → 3V3, GND → GND, EN not connected, RST joined to SLP.', 'VMOT → +12 V, the GND next to it → −12 V and ESP32 GND, 100 µF across VMOT and GND.', 'Motor coil A → 1A / 1B, coil B → 2A / 2B.', 'Set the current limit (Vref) with the trimpot, then upload the code.'],
    code: "const int STEP = 18;\nconst int DIR  = 5;\n\nvoid setup() {\n  pinMode(STEP, OUTPUT);\n  pinMode(DIR, OUTPUT);\n}\n\nvoid turn(bool forward) {\n  digitalWrite(DIR, forward ? HIGH : LOW);\n  for (int i = 0; i < 200; i++) {      // 200 full steps = 1 turn\n    digitalWrite(STEP, HIGH); delayMicroseconds(2500);\n    digitalWrite(STEP, LOW);  delayMicroseconds(2500);   // 5 ms per step = 60 RPM\n  }\n}\n\nvoid loop() {\n  turn(true);  delay(500);\n  turn(false); delay(500);\n}",
    note2: 'In the simulator the STEP pulses come from a PWM pin you set by hand; on the real board the code makes them, and can count exact steps.',
  },
  {
    id: 'led', title: 'LED resistor', example: 'led', tag: 'Basics',
    intro: 'An LED needs a fixed voltage (its forward voltage) and the resistor sets the current.',
    steps: [
      ['Formula', 'R = (Vsupply − Vled) ÷ I<br>9 V, red LED 1.8 V, 15 mA → (9 − 1.8) ÷ 0.015 = 480 Ω → use <b>470 Ω</b>.'],
      ['Resistor power', 'P = I² × R = 0.015² × 470 = 0.1 W → a ¼ W resistor is fine.'],
      ['Typical forward voltages', 'Red 1.8–2 V · yellow / green 2–2.2 V · blue / white 3–3.2 V. Most 5 mm LEDs: 10–20 mA.'],
    ],
    tryit: ['Change the LED to blue: current drops (less voltage left for the resistor).', 'Set the resistor to 100 Ω: the LED panel warns it will burn.'],
  },
  {
    id: 'flyback', title: 'Flyback diode (coils, relays, solenoids)', example: 'flyback', tag: 'Protection',
    intro: 'A coil stores energy in its magnetic field. Switch it off and it forces the current to keep flowing, so the voltage jumps to hundreds of volts and kills the transistor or MOSFET.',
    steps: [
      ['The spike', 'V = L × di/dt. A fast switch-off means a huge di/dt, so a huge voltage. In the example without the diode it goes past 1000 V.'],
      ['The fix', 'A diode across the coil, <b>cathode (bar) to +</b>. While on, it is reversed and does nothing. At switch-off it carries the coil current around in a loop, so the spike is clamped to supply + 0.7 V.'],
      ['Which diode', '1N4148 for small relays, 1N4007 or 1N5819 (Schottky, faster) for solenoids and motors.'],
    ],
    tryit: ['Hold the button, then let go: the scope shows the clamped switch-off.', 'Delete the diode and do it again: watch the spike.'],
  },
  {
    id: 'mosfet', title: 'MOSFET switch from an ESP32 pin', example: 'mosfet', tag: 'Switching',
    intro: 'A logic-level N-MOSFET lets a 3.3 V pin switch amps of 12 V load current.',
    steps: [
      ['Logic level matters', 'Rds(on) is specified at a gate voltage. IRLZ44N / AO3400 are fully on at 4.5 V and work at 3.3 V. IRF540N / IRFZ44N need 10 V: on 3.3 V they stay half on and get hot (the simulator shows this).'],
      ['Gate resistors', '100 Ω in series with the gate limits the charging current spike. 10 kΩ from gate to ground keeps it OFF while the ESP32 boots (pins float).'],
      ['Heat', 'P = I² × Rds(on). 0.5 A × 0.5 A × 0.05 Ω = 12 mW: no heatsink needed.'],
      ['Flyback diode', 'Always across an inductive load (see the flyback article).'],
    ],
    tryit: ['Change the MOSFET to IRF540N and look at its panel: "NOT fully on".', 'Set PWM duty to 20 %: the solenoid gets less average current.'],
  },
  {
    id: 'relay', title: 'Relay driver with an NPN transistor', example: 'relay', tag: 'Switching',
    intro: 'An ESP32 pin can\'t power a relay coil (tens of mA), but it can switch a small NPN that does.',
    steps: [
      ['Coil current', '12 V relay, 400 Ω coil → 12 ÷ 400 = 30 mA.'],
      ['Where 0.65 V comes from (Vbe)', 'Between base (B) and emitter (E) an NPN is a <b>silicon diode</b>. A silicon diode only conducts once ≈ 0.6–0.7 V is across it. So while the transistor is ON, the base always sits ≈ <b>0.65 V</b> above the emitter (some books use 0.7 V: almost the same answer). This 0.65 V is called <b>Vbe</b>.'],
      ['Base current', 'To switch the relay fully ON (saturated), give the base 1/10 of the collector current: Ib = Ic ÷ 10 = 30 mA ÷ 10 = <b>3 mA</b>. (β is ≥ 100, so ÷ 10 is plenty of extra drive.)'],
      ['Base resistor', '1. GPIO HIGH = 3.3 V. Emitter on GND = 0 V, so the base = 0 + 0.65 = 0.65 V.<br>2. Voltage left across the resistor = 3.3 − 0.65 = <b>2.65 V</b>.<br>3. Ohm\'s law: R = V ÷ I = 2.65 ÷ 0.003 = 883 Ω → nearest standard value <b>1 kΩ</b>.<br>4. Check: Ib = 2.65 ÷ 1000 = 2.65 mA, close to 3 mA ✔.<br>See it: ▶ Run, set the GPIO HIGH, tap the transistor → Vbe ≈ 0.65–0.7 V.'],
      ['Diode', '1N4148 across the coil, bar to +12 V.'],
    ],
    tryit: ['Flip GPIO off: the relay releases, the diode clamps the spike.', 'Change the base resistor to 47 kΩ: the transistor is only partly on and the relay may not pull in.'],
  },
  {
    id: 'reg', title: '7805 / LM317 regulators', example: 'lm317', tag: 'Power',
    intro: 'A linear regulator gives a steady voltage and burns the extra as heat.',
    steps: [
      ['Heat', 'P = (Vin − Vout) × I. 12 V → 5 V at 0.25 A = 1.75 W: needs a small heatsink (a bare TO-220 handles about 1 W).'],
      ['Dropout', '7805 needs Vin ≥ about 7 V. AMS1117 only about 6.1 V for 5 V (1.1 V dropout).'],
      ['LM317 formula', 'Vout = 1.25 × (1 + R2 ÷ R1). R1 = 240 Ω, R2 = 720 Ω → 5 V. Keep R1 ≤ 240 Ω so at least 5 mA always flows.'],
    ],
    tryit: ['Lower B1 to 6 V: dropout, the output sags.', 'Change R2 to 2.2 kΩ: about 12.7 V out.'],
  },
];

export function learnTab(root) {
  const list = el('div', { class: 'learn-list' });
  const view = el('div', { class: 'learn-view' });
  root.append(list, view);
  for (const a of ARTICLES) list.append(el('button', { class: 'learn-it', type: 'button', onclick: () => show(a.id) }, el('span', { class: 'tag', text: a.tag }), el('span', { text: a.title })));
  function openExample(name) {
    store.set('sch.cur', JSON.stringify(S.example(name)));
    store.set('sch.view', 'sch');
    dispatchEvent(new CustomEvent('f9t-example', { detail: name }));
    location.hash = '#schematic';
  }
  function codeBox(code) {
    const b = el('button', { class: 'btn', type: 'button', text: '📋 Copy code', onclick: async () => { try { await navigator.clipboard.writeText(code); b.textContent = '✓ Copied'; } catch { const r = document.createRange(); r.selectNodeContents(pre); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selected: copy it'; } setTimeout(() => (b.textContent = '📋 Copy code'), 1800); } });
    const pre = el('pre', { class: 'steps learn-code', text: code });
    return el('div', { class: 'learn-step' }, el('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' }, el('h3', { text: '💻 Code (Arduino IDE)' }), b), pre);
  }
  function show(id) {
    const a = ARTICLES.find(x => x.id === id) ?? ARTICLES[0];
    store.set('learn.cur', a.id);
    for (const b of list.children) b.classList.toggle('on', b.lastChild.textContent === a.title);
    view.innerHTML = '';
    const card = el('section', { class: 'card learn' },
      el('h2', { text: a.title }),
      el('p', { class: 'lead', text: a.intro }),
      a.example ? el('div', { class: 'row wrap' }, el('button', { class: 'btn primary', type: 'button', text: '⚡ Open in Schematic', onclick: () => openExample(a.example) })) : null,
      a.parts ? el('div', { class: 'learn-parts' }, a.parts.map(([k, v]) => el('div', {}, el('b', { text: k }), el('span', { text: v })))) : null,
      ...a.steps.map(([h, html]) => el('div', { class: 'learn-step' }, el('h3', { text: h }), el('p', { html }))),
      a.tryit ? el('div', { class: 'learn-try' }, el('h3', { text: '🧪 Try it in the simulator' }), el('ul', {}, a.tryit.map(t => el('li', { text: t })))) : null,
      a.note2 ? el('p', { class: 'note', text: a.note2 }) : null,
      a.build ? el('div', { class: 'learn-step' }, el('h3', { text: '🔧 Build it for real' }), el('ol', { class: 'learn-ol' }, a.build.map(t => el('li', { text: t })))) : null,
      a.code ? codeBox(a.code) : null);
    view.append(card);
  }
  show(store.get('learn.cur', 'preamp'));
}
