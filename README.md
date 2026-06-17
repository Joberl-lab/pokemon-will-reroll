# Pokemon Will Reroll

**A module for the Pokerole system in Foundry VTT**  
Adds the ability to reroll dice in rolls by spending **Will points** of the Pokémon or Trainer.

> ✅ Works with **Foundry V13**  
> 📦 **Manifest for installation:**  
> `https://github.com/Joberl-lab/pokemon-will-reroll/releases/latest/download/module.json`

---

## How the Module Works

### 1. Reroll Button Appearance
After any roll in the Pokerole chat, the module checks the message and, if it finds dice values (numbers from 1 to 6), adds a button **«Würfel neu werfen»** (reroll dice) below the message.

The button appears only if:
- the message has an associated actor (Pokémon),
- the current user is the **GM** or **owner** of that actor.

### 2. Selecting Dice to Reroll
When the button is clicked, a dialog window opens showing all unsuccesful dice, which you may click to reroll by spending will points. If "Allow all dice reroll" setting is on, window contains:
- all dice from the roll,
- **green** highlights for successes (value ≥ 4),
- **red** highlights for failures (value < 4).

The player can **select any dice** (successes can also be rerolled if the corresponding setting is enabled).

### 3. Spending Will Points
Each rerolled die costs **1 Will point**.

Sources of Will (in order of priority):
1. **The Pokémon's own Will** – spent first.
2. **Trainer's Will** – if the Pokémon lacks enough points and the setting allows using trainer Will.

If there are not enough Will points from either source, the reroll is cancelled and a warning is shown.

### 4. Updating the Chat Message
After a successful reroll:
- old dice values are replaced with new ones,
- the chat message is updated,
- if the **«showWillMessage»** setting is enabled, a system message about spent Will is sent to chat.

### 5. Visual Marker
Messages that have already been rerolled receive a **golden border** – this helps GMs and players see that the roll has been modified.

---

## Module Settings

In the world settings (`World Settings`) the following options are available:

| Setting | Description | Default |
|---------|-------------|---------|
| **Allow Trainer Will** | Allow spending trainer Will if the Pokémon lacks enough | `true` |
| **Allow Multiple Rerolls** | Allow rerolling the same roll multiple times | `false` |
| **Show Will Message** | Show a chat message about spent Will | `true` |
| **Allow Reroll All Dice** | Allow rerolling **all** dice (including successes) with one click | `false` |

---

## Installation

1. In Foundry VTT, open **«Manage Modules»**.
2. Click **«Install Module»**.
3. Paste the manifest URL:  
   `https://github.com/Joberl-lab/pokemon-will-reroll/releases/latest/download/module.json`
4. Click **«Install»** and activate the module in your world settings.

---

## Requirements

- **Foundry VTT** version **13** or newer.
- **Pokerole system** (the module relies on its data structure).

---

## For Developers

Source code is available in the repository:  
[https://github.com/p4vl0-dev/pokemon-will-reroll](https://github.com/p4vl0-dev/pokemon-will-reroll)
