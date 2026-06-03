# 🧪 Test Fixtures — Edge Case Documentation

> **30 rules × 233 scenes** covering every edge case an outdoor AI sentry camera encounters in the real world.

## 📊 Coverage Statistics

| Metric | Count |
|---|---|
| **Total Rules** | 30 |
| **Total Scenes** | 233 |
| **Alert Scenes** | 82 (35%) |
| **Ignore Scenes** | 151 (65%) |
| **Null-match (no rule)** | 74 |
| **Edge Case Categories** | 18 |

---

## 📋 Rule Summary (30 Rules)

| ID | Condition | Action | Scene Count |
|---|---|---|---|
| 1 | Person near shed or approaching | 🔴 Alert | 11 |
| 2 | Dog or animal present | ⬜ Ignore | 6 |
| 3 | Vehicle parked in driveway | 🔴 Alert | 3 |
| 4 | Bird or small animal on lawn | ⬜ Ignore | 8 |
| 5 | Person climbing/jumping fence | 🔴 Alert | 5 |
| 6 | Wind blowing trees/debris | ⬜ Ignore | 7 |
| 7 | Person carrying tools near shed | 🔴 Alert | 6 |
| 8 | Rain, snow, weather motion | ⬜ Ignore | 7 |
| 9 | Multiple people gathering | 🔴 Alert | 4 |
| 10 | Cat or raccoon near bins | ⬜ Ignore | 5 |
| 11 | Person opening door/window | 🔴 Alert | 8 |
| 12 | Sprinkler/irrigation running | ⬜ Ignore | 3 |
| 13 | Fire, smoke, flames visible | 🔴 Alert | 4 |
| 14 | Shadows or light changes | ⬜ Ignore | 10 |
| 15 | Person with flashlight at night | 🔴 Alert | 3 |
| 16 | Leaves falling/blowing | ⬜ Ignore | 3 |
| 17 | Unknown vehicle entering | 🔴 Alert | 7 |
| 18 | Deer or livestock grazing | ⬜ Ignore | 6 |
| 19 | Drone or flying object | 🔴 Alert | 4 |
| 20 | Package or delivery at door | 🔴 Alert | 5 |
| 21 | Person wearing mask/face cover | 🔴 Alert | 6 |
| 22 | Insects or cobwebs on lens | ⬜ Ignore | 7 |
| 23 | Person running at high speed | 🔴 Alert | 4 |
| 24 | Construction noise/vibration | ⬜ Ignore | 4 |
| 25 | Person loitering suspiciously | 🔴 Alert | 5 |
| 26 | Automatic lighting on/off | ⬜ Ignore | 4 |
| 27 | Person throwing objects | 🔴 Alert | 4 |
| 28 | Reflections in windows/puddles | ⬜ Ignore | 4 |
| 29 | Person crawling on ground | 🔴 Alert | 3 |
| 30 | Normal daytime, no entities | ⬜ Ignore | 3 |
| — | **Null-match (no rule applies)** | ⬜ Ignore | 74 |

---

## 🧠 Edge Case Categories (18)

### 1. 🎭 False-Positive Traps
Objects that look like people but aren't. Critical for reducing false alarm fatigue.

| Scene | Expected |
|---|---|
| A mannequin placed near the shed as a prank | ⬜ No alert |
| A scarecrow in the garden that looks like a person | ⬜ No alert |
| A life-size cardboard cutout of a person on the porch | ⬜ No alert |
| A statue of a person in the garden | ⬜ No alert |
| An inflatable waving-arm tube man near the driveway | ⬜ No alert |
| A coat hanging on a hook that looks like a person from a distance | ⬜ No alert |

### 2. 📸 Camera Failures & Artifacts
Hardware-level issues that should never trigger an alert.

| Scene | Expected |
|---|---|
| Completely dark frame, camera lens is covered | ⬜ No alert |
| All white frame, camera is facing the sun | ⬜ No alert |
| Blurry image from camera vibration in strong wind | ⬜ No alert |
| Same frame repeated 10 times (frozen camera feed) | ⬜ No alert |
| Half the camera frame is black, the other half shows an empty yard | ⬜ No alert |
| Camera feed showing static/noise pattern (hardware failure) | ⬜ No alert |
| IR night vision mode showing everything in green monochrome | ⬜ No alert |
| Camera slowly panning (wind pushing mount) showing motion blur | ⬜ No alert |
| Condensation forming inside the camera housing | ⬜ No alert |
| Raindrops on the lens distorting the entire image | ⬜ No alert |
| Bird droppings covering half the lens | ⬜ No alert |
| Camera tilted at 45 degrees showing ground and sky | ⬜ No alert |
| Extremely overexposed image where nothing is distinguishable | ⬜ No alert |
| Underexposed night image with only pixel noise visible | ⬜ No alert |

### 3. 🧠 Pareidolia & Scale Ambiguity
Objects that the human brain (and AI) might misinterpret as threats due to shape similarity.

| Scene | Expected |
|---|---|
| A garden gnome that casts a person-shaped shadow at sunset | ⬜ No alert |
| A tree stump that resembles a crouching figure in low light | ⬜ No alert |
| A hanging plant swinging that looks like a head from a distance | ⬜ No alert |
| Car headlights creating two bright spots that look like eyes | ⬜ No alert |
| A mailbox post with a hat on top resembling a person | ⬜ No alert |
| A trash bag that has inflated and is rolling across the lawn | ⬜ No alert |

### 4. 🌪️ Weather Extremes
Environmental conditions that go beyond normal rain/snow, testing sensor limits.

| Scene | Expected |
|---|---|
| Thermal heat shimmer on hot pavement causing wavy distortion | ⬜ No alert |
| Snow-covered everything making the yard featureless white | ⬜ No alert |
| Dense fog where only the closest 2 meters are visible | ⬜ No alert |
| Dust storm reducing visibility and coating the lens | ⬜ No alert |
| Flooded yard with water reflecting the sky | ⬜ No alert |

### 5. 🪞 Reflections & Shadows
Indirect visual signals that could trick motion/entity detection.

| Scene | Expected |
|---|---|
| Reflection of a person in a ground puddle but no actual person visible | ⬜ No alert |
| Moving car reflected in the house window | ⬜ No alert |
| Shadow of a person on the wall from behind the camera | ⬜ No alert |
| Mirror-like reflection from a parked car showing trees moving | ⬜ No alert |

### 6. 🪲 Insects & Lens Occlusion
Small creatures on or near the camera that dominate the frame.

| Scene | Expected |
|---|---|
| Spider spinning a web across the camera lens | ⬜ No alert |
| Moth flying directly in front of the camera lens | ⬜ No alert |
| Cobweb strands floating across the camera view | ⬜ No alert |
| A beetle crawling across the camera housing | ⬜ No alert |
| Mosquitoes swarming near the IR illuminator | ⬜ No alert |
| An ant trail crossing directly over the lens | ⬜ No alert |
| A wasp building a nest on the camera mount | ⬜ No alert |

### 7. 🏃 Evasion & Stealth Tactics
Adversarial scenarios where intruders try to avoid detection.

| Scene | Expected |
|---|---|
| A person in all-black clothing blending into shadows | 🔴 Alert |
| A person wearing a hoodie pulled tight hiding their face | 🔴 Alert |
| A figure dashing between cover points across the yard | 🔴 Alert |
| Someone belly-crawling under the fence gap | 🔴 Alert |
| A person army-crawling toward the back door | 🔴 Alert |
| A person on hands and knees near the foundation vents | 🔴 Alert |

### 8. 🔒 Break-In Methods
Specific intrusion techniques that must always trigger alerts.

| Scene | Expected |
|---|---|
| A person smashing the shed padlock with a hammer | 🔴 Alert |
| A person using bolt cutters on the gate chain | 🔴 Alert |
| Person prying open the shed window with a screwdriver | 🔴 Alert |
| A hand reaching through a broken window pane | 🔴 Alert |
| Someone inserting a card into the door jamb to jimmy the lock | 🔴 Alert |
| A person throwing a brick at the shed window | 🔴 Alert |
| Someone tossing a Molotov cocktail toward the shed | 🔴 Alert |

### 9. 🚗 Vehicle Variants
Different types of vehicles that should trigger unknown-vehicle alerts.

| Scene | Expected |
|---|---|
| A box truck backing into the driveway with reverse lights on | 🔴 Alert |
| An ATV driving across the front yard | 🔴 Alert |
| A sedan parked with headlights still on at night | 🔴 Alert |
| A car with tinted windows idling in the driveway for 20 minutes | 🔴 Alert |

### 10. 🐾 Animal Diversity
Testing the system's ability to distinguish many animal species from humans.

| Scene | Expected |
|---|---|
| A hedgehog waddling across the lawn at dusk | ⬜ No alert |
| A lizard sunbathing on the warm concrete path | ⬜ No alert |
| A turtle crossing the driveway slowly | ⬜ No alert |
| A goat nibbling on fence posts | ⬜ No alert |
| A wild turkey strutting through the property | ⬜ No alert |
| A possum climbing into the garbage bin at night | ⬜ No alert |

### 11. 🏠 Benign Daily Activity
Normal human activity that should NOT trigger alerts.

| Scene | Expected |
|---|---|
| Person in the yard doing yoga or stretching exercises | ⬜ No alert |
| A person watering plants with a watering can on the porch | ⬜ No alert |
| A person mowing their own lawn during daytime | ⬜ No alert |
| A child drawing with chalk on the driveway | ⬜ No alert |
| Two neighbors chatting at the property boundary | ⬜ No alert |
| A utility worker in uniform reading the meter on the wall | ⬜ No alert |

### 12. 🚚 Service & Passing Vehicles
Vehicles with known purposes that shouldn't trigger unknown-vehicle alerts.

| Scene | Expected |
|---|---|
| A school bus stopping briefly in front of the house | ⬜ No alert |
| A garbage truck collecting bins from the curb | ⬜ No alert |
| A mail truck stopping at the mailbox | ⬜ No alert |
| An ice cream truck driving slowly through the neighborhood | ⬜ No alert |

### 13. 💡 Lighting Artifacts
Light-related phenomena that mimic motion or presence.

| Scene | Expected |
|---|---|
| Sunset casting long orange shadows across the entire yard | ⬜ No alert |
| Moonlight casting blue-tinted shadows through tree canopy | ⬜ No alert |
| Strobe effect from a malfunctioning streetlight | ⬜ No alert |
| Christmas lights on the house cycling through colors | ⬜ No alert |

### 14. 🤖 Autonomous Devices
Robotic or automated equipment that creates motion without human involvement.

| Scene | Expected |
|---|---|
| A Roomba vacuum cleaning the patio area | ⬜ No alert |
| A robotic lawn mower cutting the grass autonomously | ⬜ No alert |
| Garage door opening automatically (scheduled) | ⬜ No alert |

### 15. 🌸 Foliage & Fabric Motion
Organic or fabric movement caused by wind.

| Scene | Expected |
|---|---|
| A flag flapping on a pole in the yard | ⬜ No alert |
| A clothesline with sheets blowing in the wind | ⬜ No alert |
| Flower petals drifting from a blooming tree | ⬜ No alert |

### 16. 🔥 Fire & Electrical Hazards
Dangerous situations requiring immediate alert regardless of human presence.

| Scene | Expected |
|---|---|
| A small brush fire starting near dry grass | 🔴 Alert |
| Electrical sparks from a damaged power line on the ground | 🔴 Alert |
| Firecracker sparks near the garage | 🔴 Alert |

### 17. 🛩️ Aerial Objects
Objects in the sky that may indicate surveillance or trespassing.

| Scene | Expected |
|---|---|
| A large bird-shaped drone landing on the roof | 🔴 Alert |
| A quadcopter with blinking lights near the fence line | 🔴 Alert |
| A hot air balloon slowly drifting over the property (benign) | ⬜ No alert |
| A plane flying overhead casting a fast-moving shadow (benign) | ⬜ No alert |

### 18. ☁️ Atmospheric & Environmental
Natural phenomena that happen around the property.

| Scene | Expected |
|---|---|
| A rainbow appearing after rain with no other activity | ⬜ No alert |
| Northern lights visible in the sky above the property | ⬜ No alert |
| Fireworks visible in the distant sky behind the property | ⬜ No alert |
| A power line swaying and sparking in high winds | ⬜ No alert |
| A falling tree branch crashing onto the lawn | ⬜ No alert |

---

## 🔧 Usage

```bash
# Seed fixtures (validates rule ID references)
python3 scripts/seed.py

# Run benchmarks against all scenes
python3 scripts/bench.py

# Verify offline readiness
python3 scripts/verify_offline.py
```

## 📁 Files

| File | Description |
|---|---|
| `test_rules.json` | 30 alert/ignore rules with unique IDs |
| `test_scenes.json` | 233 scene descriptions with expected outcomes |

## 🎯 Design Principles

1. **Alert-to-ignore ratio (~35:65)** — Real-world security cameras see far more benign events than threats
2. **Multiple scenes per rule** — Tests robustness of each rule across varied descriptions
3. **Null-match scenes** — 74 scenes where NO rule should match, testing false-positive resistance
4. **Adversarial diversity** — Covers evasion tactics that real intruders use
5. **Sensor-level edge cases** — Camera failures, lens occlusion, and hardware artifacts
6. **Pareidolia traps** — Objects that humans and AI commonly misidentify as people
