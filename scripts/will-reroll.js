const MODULE_ID = "pokemon-will-reroll";
const DEBUG = false;

function debug(...args) {
  if (DEBUG) console.log(`[${MODULE_ID}]`, ...args);
}

function debugWarn(...args) {
  if (DEBUG) console.warn(`[${MODULE_ID}]`, ...args);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "allowTrainerWill", {
    name: "Trainer-Wille für Pokémon-Rerolls zulassen",
    hint: "Wenn aktiviert, können Spieler beim Reroll auswählen, ob der Wille des Pokémon oder des zugewiesenen Trainers verwendet wird.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });
});


Hooks.on("renderChatMessage", (message, html) => {
  const root = html instanceof jQuery ? html : $(html);

  if (message.getFlag(MODULE_ID, "willModified")) {
     root.css({
       border: "2px solid #d9b44a",
       boxShadow: "0 0 6px rgba(217,180,74,0.45)"
     });
   }

  const text = root.text();

  const isPokeroleRoll =
    text.includes("Accuracy roll") ||
    text.includes("Damage roll");

  if (!isPokeroleRoll) return;

  const actor = getRerollActor(message);

  if (!actor) return;

  const isOwner =
    game.user.isGM ||
    actor.isOwner;

  if (!isOwner) return;

  const diceValues = extractPokeroleDiceValues(root);
  if (!diceValues.length) return;

  if (root.find(".will-reroll-button").length) return;

  const button = $(`
    <button type="button" class="chat-action will-reroll-button" style="margin-top: 5px; width: 100%;">
      <i class="fas fa-dice-d6"></i> Wille einsetzen
    </button>
  `);

  button.one("click", () => {
    const currentRoot = $(`<div class="message-content">${message.content}</div>`);
    const currentDiceValues = extractPokeroleDiceValues(currentRoot);
    openPokeroleWillRerollDialog(message, currentDiceValues);
  });

  root.find(".message-content").append(button);
});

function isTrainerWillAllowed() {
  return game.settings.get(MODULE_ID, "allowTrainerWill");
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

function getActorMaxWill(actor) {
  return Number(actor?.system?.will?.max ?? getActorWill(actor));
}

async function spendWillFromSources(pokemonActor, trainerActor, pokemonCost, trainerCost) {
  if (pokemonCost > 0) {
    const pokemonWill = getActorWill(pokemonActor);

    if (pokemonWill < pokemonCost) {
      ui.notifications.warn(`${pokemonActor.name} hat nicht genug Wille.`);
      return false;
    }
  }

  if (trainerCost > 0) {
    const trainerWill = getActorWill(trainerActor);

    if (trainerWill < trainerCost) {
      ui.notifications.warn(`${trainerActor.name} hat nicht genug Wille.`);
      return false;
    }
  }

  if (pokemonCost > 0) {
    await spendActorWill(pokemonActor, pokemonCost);
  }

  if (trainerCost > 0) {
    await spendActorWill(trainerActor, trainerCost);
  }

  return true;
}

function autoDistributeWill(html, pokemonActor, trainerActor) {
  const selectedCount =
    html.find('.will-reroll-die[data-selected="true"]').length;

  const pokemonInput = html.find("#pokemon-will-cost");
  const trainerInput = html.find("#trainer-will-cost");

  const pokemonMax = getActorWill(pokemonActor);
  const trainerMax = trainerActor ? getActorWill(trainerActor) : 0;

  let trainerCost = trainerActor ? Number(trainerInput.val() ?? 0) : 0;

  trainerCost = Math.max(0, Math.min(trainerCost, trainerMax, selectedCount));

  let pokemonCost = selectedCount - trainerCost;

  if (pokemonCost > pokemonMax) {
    pokemonCost = pokemonMax;
    trainerCost = selectedCount - pokemonCost;
    trainerCost = Math.max(0, Math.min(trainerCost, trainerMax));
  }

  pokemonInput.val(pokemonCost);
  if (trainerActor) trainerInput.val(trainerCost);
}

function openPokeroleWillRerollDialog(message, oldResults) {
  const pokemonActor = getRerollActor(message);
  const trainerActor = isTrainerWillAllowed() ? getTrainerActor() : null;

  const currentWill = pokemonActor ? getActorWill(pokemonActor) : 0;
  const maxWill = getActorMaxWill(pokemonActor);
  const diceButtons = oldResults
  .map((value, index) => {
    if (value >= 4) return "";

    return `
      <button
       type="button"
       class="will-reroll-die"
       data-index="${index}"
       data-selected="false"
       style="
         width: 36px;
         height: 36px;
         padding: 0;
         border: 1px solid #777;
         border-radius: 4px;
         background: #b8b8b8;
         color: #111;
         font-weight: bold;
         font-size: 16px;
         cursor: pointer;
         flex: 0 0 auto;
       "
     >${value}</button>
   `;
  })
  .join("");

  new Dialog({
    title: "Wille-Reroll",
    content: `
  <form>
    <div class="will-reroll-status" style="border: 1px solid #999; padding: 8px; margin-bottom: 8px;">
  <strong>Wille einsetzen</strong><br>

  <div style="margin-top: 4px;">
    ${pokemonActor?.name ?? "Pokémon"}:
    <input
      id="pokemon-will-cost"
      type="number"
      value="0"
      min="0"
      max="${getActorWill(pokemonActor)}"
      style="width: 50px;"
    >
    / ${getActorWill(pokemonActor)}
  </div>

  ${trainerActor ? `
    <div style="margin-top: 4px;">
      ${trainerActor.name}:
      <input
        id="trainer-will-cost"
        type="number"
        value="0"
        min="0"
        max="${getActorWill(trainerActor)}"
        style="width: 50px;"
      >
      / ${getActorWill(trainerActor)}
    </div>
  ` : ""}

  <hr>

  Kosten: <span id="will-reroll-cost">0</span>
  |
  Verteilt: <span id="will-reroll-spent">0</span>
</div>

    <p>Wähle die Würfel aus, die neu gewürfelt werden sollen.</p>
    
    <div
  class="will-reroll-dice-pool"
  style="
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
    margin-bottom: 16px;
  "
>
  ${diceButtons || "<p>Keine fehlgeschlagenen Würfel verfügbar.</p>"}
</div>
  </form>
`,

    buttons: {
      reroll: {
        label: "Neu würfeln",
        icon: '<i class="fas fa-dice"></i>',
        callback: async html => {
  const selected = html.find('.will-reroll-die[data-selected="true"]')
    .map((_, el) => Number(el.dataset.index))
    .get();

  if (!selected.length) {
    ui.notifications.warn("Du hast keine Würfel ausgewählt.");
    return;
  }

  if (!pokemonActor) {
    ui.notifications.warn("Kein Pokémon gefunden.");
    return;
  }

  const cost = selected.length;

  let pokemonCost = cost;
  let trainerCost = 0;

  if (trainerActor) {
    pokemonCost = Number(html.find("#pokemon-will-cost").val() ?? 0);
    trainerCost = Number(html.find("#trainer-will-cost").val() ?? 0);

    if (pokemonCost + trainerCost !== cost) {
      ui.notifications.warn(`Die verteilten Wille-Kosten müssen genau ${cost} ergeben.`);
      return;
    }
  }

  const newResults = [...oldResults];

  for (const index of selected) {
    newResults[index] = Math.ceil(Math.random() * 6);
  }

  const success = await spendWillFromSources(
    pokemonActor,
    trainerActor,
    pokemonCost,
    trainerCost
  );

  if (!success) {
    ui.notifications.warn(`${pokemonActor.name} hat nicht genug Wille.`);
    return;
  }

  await createWillMessageOnce(
    pokemonActor,
    trainerActor,
    pokemonCost,
    trainerCost,
    message
  );
  await updatePokeroleRollMessage(message, oldResults, newResults);
}
      },
      cancel: {
        label: "Abbrechen"
      }
    },

render: html => {
  const updatePreview = () => {
    const selectedCount =
      html.find('.will-reroll-die[data-selected="true"]').length;

    const pokemonInput = html.find("#pokemon-will-cost");
    const trainerInput = html.find("#trainer-will-cost");

    const pokemonMax = getActorWill(pokemonActor);
    const trainerMax = trainerActor ? getActorWill(trainerActor) : 0;

    let pokemonCost = Number(pokemonInput.val() ?? 0);
    let trainerCost = trainerActor ? Number(trainerInput.val() ?? 0) : 0;

    pokemonCost = Math.max(0, Math.min(pokemonCost, pokemonMax));
    trainerCost = Math.max(0, Math.min(trainerCost, trainerMax));

    pokemonInput.val(pokemonCost);
    if (trainerActor) trainerInput.val(trainerCost);

    const totalSpent = pokemonCost + trainerCost;
    const valid = totalSpent === selectedCount;

    html.find("#will-reroll-cost").text(selectedCount);
    html.find("#will-reroll-spent").text(totalSpent);
    html.find("#will-reroll-spent").css("color", valid ? "" : "red");
  };

  html.find(".will-reroll-die").on("click", event => {
    const button = $(event.currentTarget);
    const isSelected = button.attr("data-selected") === "true";

    button.attr("data-selected", String(!isSelected));

    if (!isSelected) {
      button.css({
        background: "#d9b44a",
        color: "#111",
        border: "2px solid #7a5a00",
        boxShadow: "0 0 6px rgba(217, 180, 74, 0.8)"
      });
    } else {
      button.css({
        background: "#b8b8b8",
        color: "#111",
        border: "1px solid #777",
        boxShadow: "inset 0 0 2px rgba(0,0,0,0.4)"
      });
    }

    autoDistributeWill(html, pokemonActor, trainerActor);
    updatePreview();
  });

  html.find("#trainer-will-cost").on("input change", () => {
  const selectedCount =
    html.find('.will-reroll-die[data-selected="true"]').length;

  const pokemonInput = html.find("#pokemon-will-cost");
  const trainerInput = html.find("#trainer-will-cost");

  const pokemonMax = getActorWill(pokemonActor);
  const trainerMax = trainerActor ? getActorWill(trainerActor) : 0;

  let trainerCost = Number(trainerInput.val() ?? 0);
  trainerCost = Math.max(0, Math.min(trainerCost, trainerMax, selectedCount));

  let pokemonCost = selectedCount - trainerCost;
  pokemonCost = Math.max(0, Math.min(pokemonCost, pokemonMax));

  trainerInput.val(trainerCost);
  pokemonInput.val(pokemonCost);

  updatePreview();
});

html.find("#pokemon-will-cost").on("input change", () => {
  const selectedCount =
    html.find('.will-reroll-die[data-selected="true"]').length;

  const pokemonInput = html.find("#pokemon-will-cost");
  const trainerInput = html.find("#trainer-will-cost");

  const pokemonMax = getActorWill(pokemonActor);
  const trainerMax = trainerActor ? getActorWill(trainerActor) : 0;

  let pokemonCost = Number(pokemonInput.val() ?? 0);
  pokemonCost = Math.max(0, Math.min(pokemonCost, pokemonMax, selectedCount));

  let trainerCost = selectedCount - pokemonCost;
  trainerCost = Math.max(0, Math.min(trainerCost, trainerMax));

  pokemonInput.val(pokemonCost);
  if (trainerActor) trainerInput.val(trainerCost);

  updatePreview();
});

  autoDistributeWill(html, pokemonActor, trainerActor);
  updatePreview();
}

  }).render(true);
}

function getRerollActor(message) {
  const sceneId = message.speaker.scene;
  const tokenId = message.speaker.token;

  const scene = game.scenes.get(sceneId);
  const token = scene?.tokens.get(tokenId);

  return token?.actor ?? null;
}

function getActorWill(actor) {
  return Number(actor.system.will?.value ?? 0);
}

async function getRandomWillMessage(actor) {
  const path = `modules/${MODULE_ID}/templates/will-messages.json`;

  try {
    const response = await fetch(path);
    const messages = await response.json();

    if (!Array.isArray(messages) || !messages.length) {
      return `${actor.name} setzt seinen Willen ein.`;
    }

    const template = messages[Math.floor(Math.random() * messages.length)];

    return template.replaceAll("{name}", actor.name);
  } catch (error) {
    debugWarn("Will Reroll | Willensnachrichten konnten nicht geladen werden:", error);
    return `${actor.name} setzt seinen Willen ein.`;
  }
}

async function getRandomTrainerWillMessage(trainerActor, pokemonActor) {
  const path =
    `modules/${MODULE_ID}/templates/trainer-will-messages.json`;

  try {
    const response = await fetch(path);
    const messages = await response.json();

    if (!Array.isArray(messages) || !messages.length) {
      return `${trainerActor.name} unterstützt ${pokemonActor.name}.`;
    }

    const template =
      messages[Math.floor(Math.random() * messages.length)];

    return template
      .replaceAll("{trainer}", trainerActor.name)
      .replaceAll("{pokemon}", pokemonActor.name);

  } catch (error) {
    return `${trainerActor.name} unterstützt ${pokemonActor.name}.`;
  }
}


async function spendActorWill(actor, amount) {
  const currentWill = getActorWill(actor);

  if (currentWill < amount) {
    return false;
  }

  await actor.update({
    "system.will.value": currentWill - amount
  });

  return true;
}

async function createWillMessageOnce(
  pokemonActor,
  trainerActor,
  pokemonCost,
  trainerCost,
  rollMessage
) {
  const alreadyCreated =
    rollMessage.getFlag(MODULE_ID, "willMessageCreated");

  if (alreadyCreated) return;

  let text;

  if (trainerCost > 0) {
    text = await getRandomTrainerWillMessage(
      trainerActor,
      pokemonActor
    );
  } else {
    text = await getRandomWillMessage(
      pokemonActor
    );
  }

  await ChatMessage.create({
    speaker: {
      actor: pokemonActor.id,
      alias: pokemonActor.name
    },
    content: `✨ ${text} ✨`
  });

  await rollMessage.setFlag(
    MODULE_ID,
    "willMessageCreated",
    true
  );
}

async function updatePokeroleRollMessage(message, oldResults, newResults) {
  const originalContent = message.content;

  const newSuccesses = countSuccesses(newResults);
  const requiredSuccesses = getRequiredSuccesses(originalContent);

  await message.setFlag(
    MODULE_ID,
    "willModified",
    true
  );

const originalFlavor = message.flavor ?? "";

const isAccuracyRoll =
  /Accuracy roll/i.test(originalFlavor) ||
  /success(?:es)? required/i.test(originalContent);

  debug("Will Reroll | Update gestartet");
  debug("Neue Erfolge:", newSuccesses);
  debug("Benötigte Erfolge:", requiredSuccesses);
  debug("Ist Accuracy?", isAccuracyRoll);

  let content = originalContent;

  content = replaceSuccessText(content, newSuccesses);
  content = replaceDiceResults(content, newResults);
  content = replaceDamageText(content, originalContent, newSuccesses);
  content = replaceApplyDamageData(content, newSuccesses);

  if (isAccuracyRoll && newSuccesses >= requiredSuccesses) {
    debug("Will Reroll | Defense Buttons werden hinzugefügt");

const moveId =
  getOriginalMoveId(originalContent) ??
  await getMoveIdFromFlavor(message, originalFlavor);

content = addPokeroleDefenseButtons(message, content, newSuccesses, moveId);

  } else {
    debug("Will Reroll | Defense Buttons NICHT hinzugefügt");
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

  return content.replace(
    /(.+?\s+took\s+)\d+(\s+damage!?)/i,
    `$1${newDamage}$2`
  );
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

  const sceneId = message.speaker.scene;
  const tokenId = message.speaker.token;
  const actorId = message.speaker.actor;

  const attackerId = `Scene.${sceneId}.Token.${tokenId}.Actor.${actorId}`;
  const actor = await fromUuid(attackerId);

  if (!actor) {
    debugWarn("Will Reroll | Actor nicht gefunden:", attackerId);
    return null;
  }

  const item = actor.items.find(i => i.name === moveName);

  if (!item) {
    debugWarn("Will Reroll | Attacke nicht gefunden:", moveName, actor.items.map(i => i.name));
    return null;
  }

  return `${attackerId}.Item.${item.id}`;
}

function replaceSuccessText(content, successes) {
  const label = successes === 1 ? "success" : "successes";

  return content.replace(
    /<b>\d+\s+success(?:es)?<\/b>/i,
    `<b>${successes} ${label}</b>`
  );
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

  const sceneId = message.speaker.scene;
  const tokenId = message.speaker.token;
  const actorId = message.speaker.actor;

  const attackerId = `Scene.${sceneId}.Token.${tokenId}.Actor.${actorId}`;

  if (!moveId) {
    debugWarn("Will Reroll | data-move-id nicht gefunden.");
    return content;
  }

  return content + `
    <div class="pokerole">
      <div class="action-buttons">
        <button
          class="chat-action"
          data-action="clash"
          data-attacker-id="${attackerId}"
          data-move-id="${moveId}"
          data-expected-successes="${successes}"
        >Clash</button>
        <button
          class="chat-action"
          data-action="evade"
        >Evade</button>
      </div>
    </div>
  `;
}