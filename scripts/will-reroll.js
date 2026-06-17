const MODULE_ID = "pokemon-will-reroll";
const DEBUG = false;

function debug(...args) {
  if (DEBUG) console.log(`[${MODULE_ID}]`, ...args);
}

function debugWarn(...args) {
  if (DEBUG) console.warn(`[${MODULE_ID}]`, ...args);
}

// ============================================================
//  SETTINGS
// ============================================================

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "allowTrainerWill", {
    name: game.i18n.localize("WILLREROLL.Settings.allowTrainerWill.name"),
    hint: game.i18n.localize("WILLREROLL.Settings.allowTrainerWill.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, "allowMultipleRerolls", {
    name: game.i18n.localize("WILLREROLL.Settings.allowMultipleRerolls.name"),
    hint: game.i18n.localize("WILLREROLL.Settings.allowMultipleRerolls.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true
  });

  game.settings.register(MODULE_ID, "showWillMessage", {
    name: game.i18n.localize("WILLREROLL.Settings.showWillMessage.name"),
    hint: game.i18n.localize("WILLREROLL.Settings.showWillMessage.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: false
  });

  game.settings.register(MODULE_ID, "allowRerollAllDice", {
    name: game.i18n.localize("WILLREROLL.Settings.allowRerollAllDice.name"),
    hint: game.i18n.localize("WILLREROLL.Settings.allowRerollAllDice.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: false
  });
});

// ============================================================
//  CHAT MESSAGE HOOK – inject reroll button
// ============================================================

Hooks.on("renderChatMessage", (message, html) => {
  const root = html instanceof jQuery ? html : $(html);

  if (message.getFlag(MODULE_ID, "willModified")) {
    root.css({
      border: "2px solid #d9b44a",
      boxShadow: "0 0 6px rgba(217,180,74,0.45)"
    });
  }

  const diceRolls = root.find(".dice-rolls");
  if (!diceRolls.length) return;

  const diceValues = extractPokeroleDiceValues(root);
  if (!diceValues.length) return;

  const { actor, token } = getRerollActorAndToken(message);
  if (!actor) return;

  const isOwner = game.user.isGM || actor.isOwner;
  if (!isOwner) return;

  if (root.find(".will-reroll-button").length) return;

  const alreadyUsed = message.getFlag(MODULE_ID, "rerollUsed") === true;
  const allowMultiple = game.settings.get(MODULE_ID, "allowMultipleRerolls");
  if (alreadyUsed && !allowMultiple) return;

  const button = $(`
    <button type="button" class="chat-action will-reroll-button" style="margin-top: 5px; width: 100%;">
      <i class="fas fa-dice-d6"></i> ${game.i18n.localize("WILLREROLL.Button.label")}
    </button>
  `);

  button.on("click", () => {
    const currentRoot = $(`<div class="message-content">${message.content}</div>`);
    const currentDiceValues = extractPokeroleDiceValues(currentRoot);
    openPokeroleWillRerollDialog(message, currentDiceValues);
  });

  root.find(".message-content").append(button);
});

// ============================================================
//  HELPERS
// ============================================================

function isTrainerWillAllowed() {
  return game.settings.get(MODULE_ID, "allowTrainerWill");
}

function shouldShowWillMessage() {
  return game.settings.get(MODULE_ID, "showWillMessage");
}

function isRerollAllAllowed() {
  return game.settings.get(MODULE_ID, "allowRerollAllDice");
}

function extractPokeroleDiceValues(root) {
  const values = [];
  root.find(".dice-rolls .roll").each((_, element) => {
    const text = $(element).text().trim();
    if (/^[1-6]$/.test(text)) {
      values.push(Number(text));
    }
  });
  return values;
}

function countSuccesses(results) {
  return results.filter(value => value >= 4).length;
}

function getTrainerActor() {
  return game.user.character ?? null;
}

function getDieColor(value, allowAll) {
  if (!allowAll) return '#b8b8b8';
  return value >= 4 ? '#4CAF50' : '#f44336';
}

// ============================================================
//  ACTOR RESOLUTION
// ============================================================

function getRerollActorAndToken(message) {
  let actor = null;
  let token = null;
  const speaker = message.speaker;
  const sceneId = speaker.scene;
  const tokenId = speaker.token;
  const actorId = speaker.actor;

  if (sceneId && tokenId) {
    const scene = game.scenes.get(sceneId);
    if (scene) token = scene.tokens.get(tokenId) ?? null;
  }

  if (actorId) {
    actor = game.actors.get(actorId) ?? null;
  }

  if (!actor && token?.actor) {
    actor = token.actor;
  }

  let isLocalCopy = false;
  if (token && token.actorLink === false && token.actor) {
    if (actor && actor.id === token.actor.id) {
      isLocalCopy = true;
    }
    if (!actor && token.actor) {
      isLocalCopy = true;
      actor = token.actor;
    }
  }

  debug(`getRerollActorAndToken: actor=${actor?.name} (${actor?.id}), token=${token?.id}, token.actorLink=${token?.actorLink}, isLocalCopy=${isLocalCopy}`);
  return { actor, token, isLocalCopy };
}

// ============================================================
//  WILL MANAGEMENT
// ============================================================

function getWillSource(actor, token, isLocalCopy = false) {
  if (token) {
    const isLinked = token.actorLink === true;
    debug(`Token ${token.id}: actorLink=${token.actorLink} (linked=${isLinked}), isLocalCopy=${isLocalCopy}`);

    if (!isLinked) {
      if (isLocalCopy && token.actor) {
        debug("Using unlinked token's own actor (local copy)");
        return { type: 'token', data: token.actor };
      } else if (actor) {
        debug("Using global actor for unlinked token (from tab)");
        return { type: 'actor', data: actor };
      } else if (token.actor) {
        debug("Fallback: using token.actor");
        return { type: 'token', data: token.actor };
      }
    } else {
      if (actor) {
        debug("Using linked token -> global actor");
        return { type: 'actor', data: actor };
      } else if (token.actor) {
        return { type: 'actor', data: token.actor };
      }
    }
  }

  if (actor) {
    debug("No token or fallback, using global actor");
    return { type: 'actor', data: actor };
  }

  debug("No source found");
  return { type: 'none', data: null };
}

function getActorWill(actor, token, isLocalCopy = false) {
  const source = getWillSource(actor, token, isLocalCopy);
  if (source.type === 'none') {
    debug("getActorWill: no source, returning 0");
    return 0;
  }
  const will = Number(source.data?.system?.will?.value ?? 0);
  debug(`getActorWill: source=${source.type}, will=${will}`);
  return will;
}

async function spendActorWill(actor, amount, token, isLocalCopy = false) {
  debug(`spendActorWill: actor=${actor?.name}, amount=${amount}, token=${token?.id}, isLocalCopy=${isLocalCopy}`);
  const source = getWillSource(actor, token, isLocalCopy);
  if (source.type === 'none') {
    debug("spendActorWill: no source, returning false");
    return false;
  }
  const current = getActorWill(actor, token, isLocalCopy);
  if (current < amount) {
    debug(`spendActorWill: not enough will (${current} < ${amount})`);
    return false;
  }
  const newWill = current - amount;
  const targetActor = source.data;
  if (!targetActor) {
    debug("spendActorWill: no target actor to update");
    return false;
  }
  debug(`spendActorWill: updating actor ${targetActor.name} (${targetActor.id}) to ${newWill}`);
  await targetActor.update({ "system.will.value": newWill });
  return true;
}

async function spendWillForReroll(pokemonActor, trainerActor, amount, token, isLocalCopy) {
  if (!pokemonActor) return false;

  const pokemonWill = getActorWill(pokemonActor, token, isLocalCopy);
  let remaining = amount;

  const fromPokemon = Math.min(pokemonWill, remaining);
  if (fromPokemon > 0) {
    const success = await spendActorWill(pokemonActor, fromPokemon, token, isLocalCopy);
    if (!success) return false;
    remaining -= fromPokemon;
  }

  if (remaining > 0 && isTrainerWillAllowed() && trainerActor) {
    const trainerWill = getActorWill(trainerActor, null, false);
    if (trainerWill >= remaining) {
      await spendActorWill(trainerActor, remaining, null, false);
      remaining = 0;
    } else {
      ui.notifications.warn(game.i18n.format("WILLREROLL.Notifications.notEnoughWill", { name: trainerActor.name }));
      return false;
    }
  }

  if (remaining > 0) {
    ui.notifications.warn(game.i18n.format("WILLREROLL.Notifications.notEnoughWill", { name: pokemonActor.name }));
    return false;
  }

  return true;
}

// ============================================================
//  DIALOG V2 – Will Reroll
// ============================================================

function openPokeroleWillRerollDialog(message, oldResults) {
  const { actor, token, isLocalCopy } = getRerollActorAndToken(message);
  const pokemonActor = actor;
  const trainerActor = isTrainerWillAllowed() ? getTrainerActor() : null;

  const currentWill = pokemonActor ? getActorWill(pokemonActor, token, isLocalCopy) : 0;
  const trainerCurrentWill = trainerActor ? getActorWill(trainerActor, null, false) : 0;

  const allowRerollAll = isRerollAllAllowed();

  debug(`openDialog: currentWill=${currentWill}, actor=${pokemonActor?.name}, token=${token?.id}, isLocalCopy=${isLocalCopy}, trainerWill=${trainerCurrentWill}`);

  // Build dice buttons
  const diceButtons = oldResults
    .map((value, index) => {
      if (allowRerollAll) {
        const baseColor = getDieColor(value, true);
        return `
          <button
            type="button"
            class="will-reroll-die"
            data-index="${index}"
            data-value="${value}"
            data-selected="false"
            style="
              width: 36px; height: 36px; padding: 0;
              border: 1px solid #777; border-radius: 4px;
              background: ${baseColor}; color: #111;
              font-weight: bold; font-size: 16px;
              cursor: pointer; flex: 0 0 auto;
            "
          >${value}</button>
        `;
      } else {
        if (value >= 4) return "";
        return `
          <button
            type="button"
            class="will-reroll-die"
            data-index="${index}"
            data-value="${value}"
            data-selected="false"
            style="
              width: 36px; height: 36px; padding: 0;
              border: 1px solid #777; border-radius: 4px;
              background: #b8b8b8; color: #111;
              font-weight: bold; font-size: 16px;
              cursor: pointer; flex: 0 0 auto;
            "
          >${value}</button>
        `;
      }
    })
    .join("");

  // Build content HTML (with or without trainer fields, always with free reroll checkbox)
  let willFieldsHTML = '';
  const freeRerollHTML = `
    <div style="margin-top:6px; text-align:center;">
      <label>
        <input type="checkbox" id="free-reroll-checkbox"> ${game.i18n.localize("WILLREROLL.Dialog.freeRerollLabel")}
      </label>
    </div>
  `;

  if (trainerActor) {
    willFieldsHTML = `
      <div style="display:flex; justify-content:space-around; margin-top:8px; flex-wrap:wrap;">
        <div>
          <strong>${pokemonActor.name}</strong><br>
          <input type="number" id="pokemon-will-cost" value="0" min="0" max="${currentWill}" step="1" style="width:60px;">
          <span style="font-size:0.8em;"> / ${currentWill}</span>
        </div>
        <div>
          <strong>${trainerActor.name}</strong><br>
          <input type="number" id="trainer-will-cost" value="0" min="0" max="${trainerCurrentWill}" step="1" style="width:60px;">
          <span style="font-size:0.8em;"> / ${trainerCurrentWill}</span>
        </div>
      </div>
      ${freeRerollHTML}
      <hr>
      <div style="text-align:center;">
        <span>${game.i18n.localize("WILLREROLL.Dialog.costLabel")}: <span id="will-reroll-cost-display">0</span></span>
        &nbsp;|&nbsp;
        <span>${game.i18n.localize("WILLREROLL.Dialog.spentLabel")}: <span id="will-reroll-spent-display">0</span></span>
      </div>
    `;
  } else {
    willFieldsHTML = `
      <div style="margin-top:6px;">
        <strong>${pokemonActor?.name ?? "Pokémon"}</strong><br>
        <span style="font-size:0.9em; color:#666;">
          ${game.i18n.localize("WILLREROLL.Dialog.willCost")}: <span id="will-reroll-cost-display">0</span>
          &nbsp;|&nbsp;
          ${game.i18n.localize("WILLREROLL.Dialog.willAvailable")}: <span id="will-reroll-available-display">${currentWill}</span>
        </span>
      </div>
      ${freeRerollHTML}
    `;
  }

  const contentHTML = `
    <form>
      <div class="will-reroll-status" style="border:1px solid #999; padding:8px; margin-bottom:8px; text-align:center;">
        <strong>${game.i18n.localize("WILLREROLL.Dialog.willHeader")}</strong><br>
        ${willFieldsHTML}
      </div>
      <p style="text-align:center;">${game.i18n.localize("WILLREROLL.Dialog.selectDice")}</p>
      <div class="will-reroll-dice-pool" style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center; margin-top:8px; margin-bottom:16px;">
        ${diceButtons || `<p>${game.i18n.localize("WILLREROLL.Dialog.noFailedDice")}</p>`}
      </div>
    </form>
  `;

  // ----- Common reroll action (V13) -----
  async function rerollAction(container, forceFree = false) {
    const selected = $(container).find('.will-reroll-die[data-selected="true"]')
      .map((_, el) => Number(el.dataset.index))
      .get();

    if (!selected.length) {
      ui.notifications.warn(game.i18n.localize("WILLREROLL.Notifications.noDiceSelected"));
      return false;
    }
    if (!pokemonActor) {
      ui.notifications.warn(game.i18n.localize("WILLREROLL.Notifications.noPokemon"));
      return false;
    }

    const cost = selected.length;
    const freeReroll = forceFree || $(container).find("#free-reroll-checkbox").prop("checked") || false;

    let pokemonCost = 0;
    let trainerCost = 0;

    if (!freeReroll) {
      if (trainerActor) {
        pokemonCost = Number($(container).find("#pokemon-will-cost").val() ?? 0);
        trainerCost = Number($(container).find("#trainer-will-cost").val() ?? 0);

        if (pokemonCost + trainerCost !== cost) {
          ui.notifications.warn(game.i18n.localize("WILLREROLL.Notifications.costMismatch"));
          return false;
        }

        const pokemonWill = getActorWill(pokemonActor, token, isLocalCopy);
        const trainerWill = getActorWill(trainerActor, null, false);
        if (pokemonCost > pokemonWill || trainerCost > trainerWill) {
          ui.notifications.warn(game.i18n.format("WILLREROLL.Notifications.notEnoughWill", { name: pokemonActor.name }));
          return false;
        }
      } else {
        const pokemonWill = getActorWill(pokemonActor, token, isLocalCopy);
        if (cost > pokemonWill) {
          ui.notifications.warn(game.i18n.format("WILLREROLL.Notifications.notEnoughWill", { name: pokemonActor.name }));
          return false;
        }
        pokemonCost = cost;
      }
    }

    if (!freeReroll) {
      const success = await spendWillForReroll(pokemonActor, trainerActor, pokemonCost + trainerCost, token, isLocalCopy);
      if (!success) return false;
    }

    const newValues = Array.from({ length: cost }, () => Math.ceil(Math.random() * 6));
    const newResults = [...oldResults];
    for (let i = 0; i < selected.length; i++) {
      newResults[selected[i]] = newValues[i];
    }

    if (!game.settings.get(MODULE_ID, "allowMultipleRerolls")) {
      await message.setFlag(MODULE_ID, "rerollUsed", true);
    }

    if (shouldShowWillMessage()) {
      await createWillMessageOnce(pokemonActor, trainerActor, cost, message);
    }

    await updatePokeroleRollMessage(message, oldResults, newResults);

    if (game.dice3d?.showForRoll) {
      try {
        const rollFormula = `${cost}d6`;
        const roll = new Roll(rollFormula);
        roll.terms[0].results = newValues.map(val => ({ result: val, active: true }));
        roll._total = newValues.reduce((a, b) => a + b, 0);

        const speaker = ChatMessage.getSpeaker({ actor: pokemonActor });
        const chatData = {
          speaker: speaker,
          flavor: game.i18n.localize("WILLREROLL.Dialog.dsnFlavor")
        };
        await game.dice3d.showForRoll(roll, game.user, true, chatData);
      } catch (err) {
        debugWarn("DSN showForRoll error, continuing without animation", err);
      }
    }

    return true;
  }

  // ----- Selecting all dice -----
  function selectAllDice(element) {
    const dice = element.querySelectorAll('.will-reroll-die');
    dice.forEach(btn => {
      btn.dataset.selected = "true";
      btn.style.border = "2px solid #ffd700";
      btn.style.boxShadow = "0 0 8px rgba(255,215,0,0.8)";
    });
    autoDistributeWill(element);
  }

  // ----- Update UI based on free reroll checkbox -----
  function updateFieldsForFreeReroll(element) {
    const freeCheckbox = element.querySelector("#free-reroll-checkbox");
    if (!freeCheckbox) return;
    const pokemonInput = element.querySelector("#pokemon-will-cost");
    const trainerInput = element.querySelector("#trainer-will-cost");
    const isFree = freeCheckbox.checked;

    if (pokemonInput) {
      pokemonInput.disabled = isFree;
      if (isFree) pokemonInput.value = 0;
    }
    if (trainerInput) {
      trainerInput.disabled = isFree;
      if (isFree) trainerInput.value = 0;
    }
    if (trainerActor) {
      const spentDisplay = element.querySelector("#will-reroll-spent-display");
      const costDisplay = element.querySelector("#will-reroll-cost-display");
      if (spentDisplay && costDisplay) {
        if (isFree) {
          spentDisplay.textContent = "0";
          spentDisplay.style.color = "";
        } else {
          const pokemonCost = pokemonInput ? Number(pokemonInput.value ?? 0) : 0;
          const trainerCost = trainerInput ? Number(trainerInput.value ?? 0) : 0;
          const total = pokemonCost + trainerCost;
          spentDisplay.textContent = total;
          const selectedCount = element.querySelectorAll('.will-reroll-die[data-selected="true"]').length;
          spentDisplay.style.color = (total === selectedCount) ? "" : "red";
        }
      }
    } else {
      const costDisplay = element.querySelector("#will-reroll-cost-display");
      if (costDisplay) {
        const selectedCount = element.querySelectorAll('.will-reroll-die[data-selected="true"]').length;
        costDisplay.textContent = selectedCount;
        if (!isFree && selectedCount > getActorWill(pokemonActor, token, isLocalCopy)) {
          costDisplay.style.color = "red";
          costDisplay.style.fontWeight = "bold";
        } else {
          costDisplay.style.color = "";
          costDisplay.style.fontWeight = "";
        }
      }
    }
  }

  // ----- Auto-distribute will when dice selection changes or input changes -----
  function autoDistributeWill(element) {
    const selectedCount = element.querySelectorAll('.will-reroll-die[data-selected="true"]').length;
    const freeCheckbox = element.querySelector("#free-reroll-checkbox");
    const isFree = freeCheckbox ? freeCheckbox.checked : false;

    if (!trainerActor) {
      const costDisplay = element.querySelector("#will-reroll-cost-display");
      if (costDisplay) costDisplay.textContent = selectedCount;
      const availDisplay = element.querySelector("#will-reroll-available-display");
      if (availDisplay) {
        const current = getActorWill(pokemonActor, token, isLocalCopy);
        availDisplay.textContent = current;
      }
      if (costDisplay && selectedCount > getActorWill(pokemonActor, token, isLocalCopy) && !isFree) {
        costDisplay.style.color = "red";
        costDisplay.style.fontWeight = "bold";
      } else if (costDisplay) {
        costDisplay.style.color = "";
        costDisplay.style.fontWeight = "";
      }
      return;
    }

    const pokemonInput = element.querySelector("#pokemon-will-cost");
    const trainerInput = element.querySelector("#trainer-will-cost");
    const costDisplay = element.querySelector("#will-reroll-cost-display");
    const spentDisplay = element.querySelector("#will-reroll-spent-display");
    if (!pokemonInput || !trainerInput || !costDisplay || !spentDisplay) return;

    const pokemonMax = getActorWill(pokemonActor, token, isLocalCopy);
    const trainerMax = getActorWill(trainerActor, null, false);

    let pokemonCost = Number(pokemonInput.value ?? 0);
    let trainerCost = Number(trainerInput.value ?? 0);

    if (isFree) {
      pokemonInput.value = 0;
      trainerInput.value = 0;
      pokemonInput.disabled = true;
      trainerInput.disabled = true;
      costDisplay.textContent = selectedCount;
      spentDisplay.textContent = "0";
      spentDisplay.style.color = "";
      return;
    } else {
      pokemonInput.disabled = false;
      trainerInput.disabled = false;
    }

    pokemonCost = Math.min(pokemonCost, pokemonMax);
    trainerCost = Math.min(trainerCost, trainerMax);
    pokemonCost = Math.max(0, pokemonCost);
    trainerCost = Math.max(0, trainerCost);
    pokemonInput.value = pokemonCost;
    trainerInput.value = trainerCost;

    costDisplay.textContent = selectedCount;
    const total = pokemonCost + trainerCost;
    spentDisplay.textContent = total;
    spentDisplay.style.color = (total === selectedCount) ? "" : "red";
  }

  // ----- Create DialogV2 -----
  const buttons = [
    {
      action: "reroll",
      label: game.i18n.localize("WILLREROLL.Dialog.rerollButton"),
      default: true,
      callback: async (event, button, dialogInstance) => {
        const container = dialogInstance.element;
        const shouldClose = await rerollAction(container, false);
        if (shouldClose) dialogInstance.close();
      }
    },
    {
      action: "cancel",
      label: game.i18n.localize("WILLREROLL.Dialog.cancelButton"),
      callback: () => {}
    }
  ];

  if (allowRerollAll) {
    buttons.splice(1, 0, {
      action: "rerollAll",
      label: game.i18n.localize("WILLREROLL.Dialog.rerollAllButton"),
      callback: async (event, button, dialogInstance) => {
        const container = dialogInstance.element;
        selectAllDice(container);
        const shouldClose = await rerollAction(container, true);
        if (shouldClose) dialogInstance.close();
      }
    });
  }

  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: game.i18n.localize("WILLREROLL.Dialog.title")
    },
    content: contentHTML,
    buttons: buttons,
    submit: () => {}
  });

  dialog.render({ force: true }).then(() => {
    const element = dialog.element;
    if (!element) return;

    // Dice selection
    element.addEventListener("click", (event) => {
      const target = event.target.closest(".will-reroll-die");
      if (!target) return;
      const isSelected = target.dataset.selected === "true";
      target.dataset.selected = String(!isSelected);
      if (!isSelected) {
        target.style.background = "#d9b44a";
        target.style.color = "#111";
        target.style.border = "2px solid #7a5a00";
        target.style.boxShadow = "0 0 6px rgba(217,180,74,0.8)";
      } else {
        const value = Number(target.dataset.value);
        const baseColor = allowRerollAll ? getDieColor(value, true) : '#b8b8b8';
        target.style.background = baseColor;
        target.style.color = "#111";
        target.style.border = "1px solid #777";
        target.style.boxShadow = "none";
      }
      autoDistributeWill(element);
    });

    // Input changes
    const pokemonInput = element.querySelector("#pokemon-will-cost");
    const trainerInput = element.querySelector("#trainer-will-cost");
    const freeCheckbox = element.querySelector("#free-reroll-checkbox");

    if (pokemonInput) {
      pokemonInput.addEventListener("input", () => {
        const max = Number(pokemonInput.max) || getActorWill(pokemonActor, token, isLocalCopy);
        let val = Number(pokemonInput.value ?? 0);
        if (val > max) val = max;
        if (val < 0) val = 0;
        pokemonInput.value = val;
        autoDistributeWill(element);
      });
    }
    if (trainerInput) {
      trainerInput.addEventListener("input", () => {
        const max = Number(trainerInput.max) || getActorWill(trainerActor, null, false);
        let val = Number(trainerInput.value ?? 0);
        if (val > max) val = max;
        if (val < 0) val = 0;
        trainerInput.value = val;
        autoDistributeWill(element);
      });
    }
    if (freeCheckbox) {
      freeCheckbox.addEventListener("change", () => {
        updateFieldsForFreeReroll(element);
        autoDistributeWill(element);
      });
    }

    // Initial update
    updateFieldsForFreeReroll(element);
    autoDistributeWill(element);
  });
}

// ============================================================
//  LOCALIZED WILL MESSAGES
// ============================================================

async function getRandomWillMessage(actor) {
  const messages = game.i18n.localize("WILLREROLL.WillMessages");
  if (!Array.isArray(messages) || !messages.length) {
    return game.i18n.format("WILLREROLL.WillMessage.fallback", { name: actor.name });
  }
  const template = messages[Math.floor(Math.random() * messages.length)];
  return template.replaceAll("{name}", actor.name);
}

async function createWillMessageOnce(
  pokemonActor,
  trainerActor,
  cost,
  rollMessage
) {
  const alreadyCreated = rollMessage.getFlag(MODULE_ID, "willMessageCreated");
  if (alreadyCreated) return;

  let text = await getRandomWillMessage(pokemonActor);

  await ChatMessage.create({
    speaker: {
      actor: pokemonActor.id,
      alias: pokemonActor.name
    },
    content: `✨ ${text} ✨`
  });

  await rollMessage.setFlag(MODULE_ID, "willMessageCreated", true);
}

// ============================================================
//  UPDATE ROLL MESSAGE
// ============================================================

async function updatePokeroleRollMessage(message, oldResults, newResults) {
  const originalContent = message.content;
  const newSuccesses = countSuccesses(newResults);
  const requiredSuccesses = getRequiredSuccesses(originalContent);

  await message.setFlag(MODULE_ID, "willModified", true);

  const originalFlavor = message.flavor ?? "";
  const isAccuracyRoll =
    /Accuracy roll/i.test(originalFlavor) ||
    /success(?:es)? required/i.test(originalContent);

  let content = originalContent;
  content = replaceSuccessText(content, newSuccesses);
  content = replaceDiceResults(content, newResults);
  content = replaceDamageText(content, originalContent, newSuccesses);
  content = replaceApplyDamageData(content, newSuccesses);

  if (isAccuracyRoll && newSuccesses >= requiredSuccesses) {
    const moveId =
      getOriginalMoveId(originalContent) ??
      await getMoveIdFromFlavor(message, originalFlavor);
    content = addPokeroleDefenseButtons(message, content, newSuccesses, moveId);
  }

  await message.update({ content });
}

function getRequiredSuccesses(content) {
  const match = content.match(/\((\d+)\s+success(?:es)? required\)/i);
  return match ? Number(match[1]) : 1;
}

function replaceDamageText(content, originalContent, newDamage) {
  const isDamageRoll = /Damage roll/i.test(originalContent) || /took\s+\d+\s+damage/i.test(originalContent);
  if (!isDamageRoll) return content;
  return content.replace(/(.+?\s+took\s+)\d+(\s+damage!?)/i, `$1${newDamage}$2`);
}

function replaceApplyDamageData(content, newDamage) {
  const wrapper = $(`<div>${content}</div>`);
  const button = wrapper.find('[data-action="applyDamage"]').first();
  if (!button.length) return content;
  const raw = button.attr("data-damage-updates");
  if (!raw) return content;
  try {
    const updates = JSON.parse(raw);
    for (const update of updates) {
      update.damage = newDamage;
    }
    button.attr("data-damage-updates", JSON.stringify(updates));
  } catch (error) {
    debugWarn("Will Reroll | data-damage-updates konnte nicht gelesen werden:", raw, error);
  }
  return wrapper.html();
}

async function getMoveIdFromFlavor(message, flavor) {
  const match = flavor.match(/Accuracy roll:\s*(.+)$/i);
  if (!match) return null;
  const moveName = match[1].trim();
  const actorId = message.speaker.actor;
  if (!actorId) return null;
  const actor = game.actors.get(actorId);
  if (!actor) return null;
  const item = actor.items.find(i => i.name === moveName);
  return item ? item.uuid : null;
}

function replaceSuccessText(content, successes) {
  const label = successes === 1 ? "success" : "successes";
  return content.replace(/<b>\d+\s+success(?:es)?<\/b>/i, `<b>${successes} ${label}</b>`);
}

function replaceDiceResults(content, newResults) {
  const wrapper = $(`<div>${content}</div>`);
  const diceList = wrapper.find(".dice-rolls").first();
  if (!diceList.length) return content;
  diceList.empty();
  for (const value of newResults) {
    const li = $(`<li class="roll die d6">${value}</li>`);
    if (value >= 4) li.addClass("max");
    diceList.append(li);
  }
  return wrapper.html();
}

function getOriginalMoveId(content) {
  const wrapper = $(`<div>${content}</div>`);
  return wrapper.find('[data-action="clash"]').attr("data-move-id") ?? null;
}

function addPokeroleDefenseButtons(message, content, successes, moveId) {
  if (content.includes('data-action="clash"')) return content;
  const actorId = message.speaker.actor;
  if (!actorId) return content;
  const actor = game.actors.get(actorId);
  if (!actor) return content;
  const attackerId = actor.uuid;
  if (!moveId) return content;
  return content + `
    <div class="pokerole">
      <div class="action-buttons">
        <button class="chat-action" data-action="clash" data-attacker-id="${attackerId}" data-move-id="${moveId}" data-expected-successes="${successes}">Clash</button>
        <button class="chat-action" data-action="evade">Evade</button>
      </div>
    </div>
  `;
}