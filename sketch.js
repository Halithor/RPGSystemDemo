const inchPxRatio = 3
const turnTime = 5000

function inchesToPx(inches) {
  return inches * inchPxRatio
}

function feetToPx(feet, inches = 0) {
  return inchesToPx(feet * 12 + inches)
}

function pxToInches(px) {
  return px / inchPxRatio
}

function pxToFeet(px) {
  return pxToInches(px) / 12
}

function distance({x: x1, y: y1}, {x: x2, y: y2}) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
}

// determine if two characters are in a given attack range
function isInAttackRange(char1, char2, range) {
  let {x: x1, y: y1, size: size1} = char1
  let {x: x2, y: y2, size: size2} = char2
  let dist = distance(char1, char2)
  let size
  // determine who's size to use for this calculate. This is the upper-leftest unit
  let xdiff = x1 - x2
  let ydiff = y1 - y2
  if (Math.abs(xdiff) > Math.abs(ydiff)) {
    // use x to determine
    if (x1 < x2) {
      size = size1
    } else {
      size = size2
    }
  } else {
    if (y1 < y2) {
      size = size1
    } else {
      size = size2
    }
  }
  return (dist - size) < range
}

function mouseDragged(mouseEvent) {
  if (mouseEvent.buttons === 4) {
    // middle button
    camera.x += mouseEvent.movementX
    camera.y += mouseEvent.movementY
  }
}

function mouseReleased(mouseEvent) {
  console.log(mouseEvent)
  const targetGamePos = screenPositionToGamePos({x: mouseX, y: mouseY})
  if (mouseEvent.button === 0) {
    // left
    if (gameState.uiMode === "selectLocation") {
      // Location select, call the callback
      if (gameState.uiModeCondition(targetGamePos)) {
        gameState.uiModeResult(targetGamePos)
        gameState.uiMode = "normal"
      } else {
        logAction("Invalid target location.")
      }
    } else if (gameState.uiMode === "selectEntity") {
      const target = getCharacterAtPosition(targetGamePos)
      if (target) {
        if (gameState.uiModeCondition(target)) {
          gameState.uiModeResult(target)
          gameState.uiMode = "normal"
        } else {
          logAction("Invalid target unit.")
        }
      }
    }

    // Update last clicked character
    selectedCharacter = getCharacterAtPosition(targetGamePos)
  }
}

function addToTrackerQueue(character, turns, action, state = null) {
  tracker.queue.push({character, turns, action, state})
  tracker.queue.sort((c1, c2) => c1.turns - c2.turns)
}

function doAction(caster, action, target = null) {
  let state = null
  if (action.onStart != null) {
    state = action.onStart(caster, target);
  }
  
  addToTrackerQueue(caster, action.duration, action, state)
}

function playerDoAction(action) {
  if (action.type.kind === "self") {
    doAction(playerCharacter, action)
    gameState.isPlayerTurn = false
    Actions.removeButtons()
  } else {
    Actions.removeButtons()
    // we need to get a target for the action.
    if (action.type.kind === "location") {
      
      gameState.uiMode = "selectLocation"
      gameState.uiModeResult = (target) => {
        doAction(playerCharacter, action, target)
        gameState.isPlayerTurn = false
      }
      gameState.uiModeCondition = (target) => {
        return distance(target, playerCharacter) < action.type.range
      }
    } else if (action.type.kind === "entity") {
      gameState.uiMode = "selectEntity"
      gameState.uiModeResult = (target) => {
        doAction(playerCharacter, action, target)
        gameState.isPlayerTurn = false
      }
      gameState.uiModeCondition = (target) => {
        return isInAttackRange(playerCharacter, target, action.type.range)
      }
    }
  }
}
// convert a screen Px coordinate to the in game feet coordinate.
function screenPositionToGamePos({x,y}) {
  return {
    x: Math.floor(pxToFeet(x - camera.x)),
    y: Math.floor(pxToFeet(y - camera.y))
  }
}
// given a game pos, what character is there? returns null if not found.
function getCharacterAtPosition({x,y}) {
  for (i = 0; i < characters.length; i++) {
    const c = characters[i]
    if (c.x <= x && x < c.x + c.size && c.y <= y && y < c.y + c.size) {
      return c
    }
  }
  return null
}

function logAction(text) {
  let div = createDiv(text)
  div.parent("action-log")
}

let Actions = (function() {
  function makeAction(name, duration, type, onStart, onTurn, onEnd) {
    return {name, duration, type, onStart, onTurn, onEnd}
  }

  this.wait = makeAction("Wait", 1, {kind: "self"}, null, null, null)
  // Drink a potion to heal HP.
  this.drinkPotion = makeAction("Drink Potion", 4, {kind: "self"}, (caster) => ({caster}), null, (state) => {
    // at the end add 1d10 to the HP
    const healed = Math.round(Math.random() * 9) + 1
    state.caster.hitpoints += healed
    logAction(`${state.caster.name} drinks a potion healing ${healed} HP!`)
  })
  // Move to a target location
  this.step = makeAction("Quick Step", 1, {kind: "location", range: 5}, (caster, targetLocation) => {
    return {caster, targetLocation}
  }, null, (state) => {
    state.caster.x = state.targetLocation.x
    state.caster.y = state.targetLocation.y
  })
  // Move to a target location
  this.move = makeAction("Stride", 3, {kind: "location", range: 25}, (caster, targetLocation) => {
    return {caster, startLocation: {x: caster.x, y: caster.y}, targetLocation}
  }, (turn, state) => {
    state.caster.x = Math.round(state.startLocation.x + 
        (state.targetLocation.x - state.startLocation.x) * (turn / 3))
    state.caster.y = Math.round(state.startLocation.y + 
        (state.targetLocation.y - state.startLocation.y) * (turn / 3))
    return state
  }, (state) => {
    state.caster.x = state.targetLocation.x
    state.caster.y = state.targetLocation.y
  })
  // Attack a target entity
  this.attack = makeAction("Strike", 3, {kind: "entity", range: 2}, (caster, target) => {
    return {caster, target}
  }, null, (state) => {
    if (isInAttackRange(state.caster, state.target, 2)) {
      const dmg = Math.round(Math.random() * 9) + 1 + 4
      logAction(`${state.caster.name} strikes ${state.target.name} for ${dmg} damage!`)
      state.target.hitpoints -= dmg
      if (state.target.hitpoints <= 0) {
        state.target.hitpoints = 0
        logAction(`${state.target.name} is dead!`)
      }
    } else {
      logAction(`${state.caster.name}'s strike fails to hit ${state.target.name}! They moved too fast!`)
    }
  })
  this.throwDagger = makeAction("Throw Dagger", 2, {kind: "entity", range: 10}, (caster, target) => {
    return {caster, target}
  }, null, (state) => {
    const dmg = Math.round(Math.random() * 3) + 1 + 3
    logAction(`${state.caster.name} hits ${state.target.name} with a thrown dagger for ${dmg} damage!`)
    state.target.hitpoints -= dmg
    if (state.target.hitpoints <= 0) {
      state.target.hitpoints = 0
      logAction(`${state.target.name} is dead!`)
    }
  })

  this.list = [this.wait, this.drinkPotion, this.step, this.move, this.attack, this.throwDagger]

  this.removeButtons = () => {
    this.list.forEach(element => {
      element.button.remove()
      delete element.button
    })
  }
  return this
}())

let camera

let gameState

let characters
let playerCharacter
let selectedCharacter = null

let map

let players

let tracker

function setup() {
  const canvas = createCanvas(1200, 900)
  canvas.parent('sketch-holder')
  camera = {
    x: 0, 
    y: 0,
  }
  initGameState()
  initPlayers()
  initCharacters()
  initMap()
  initTracker()
}

function initGameState() {
  gameState = {
    isPlayerTurn: false,
    uiMode: "normal",
    turn: 0,
    turnTimeLeft: 0,
  }
}

function initPlayers() {
  players = [
    {
      name: "Player",
      color: color(150, 255, 150)
    },
    {
      name: "Enemy",
      color: color(255, 150, 150)
    } 
  ]
}

function initCharacters() {
  let newCharacter = (name, x, y, size, owner, hitpoints) => 
      ({name, x, y, size, owner, hitpoints, action: null})

  characters = [
    newCharacter("Player", 5, 5, 2, players[0], 25),
    newCharacter("Bandit1", 10, 8, 2, players[1], 10),
    newCharacter("Bandit2", 15, 9, 2, players[1], 10),
    newCharacter("Ogre", 3, 15, 3, players[1], 20),
    newCharacter("Mage", 15, 15, 2, players[1], 8),
  ]
  playerCharacter = characters[0]
}

function initMap() {
  map = {
    // In feet
    width: 50,
    height: 50,
  }
}

function initTracker() {
  tracker = {
    queue: []
  }
  for (i = 0; i < characters.length; i++) {
    addToTrackerQueue(characters[i], characters[i] == playerCharacter ? 1 : 2, {name: "None", duration: "1"})
  }
}

function pickActionForEnemy(character) {
  if (character.hitpoints <= 0) {
    // don't pick an action for a dead enemy
    return
  }
  let rand = Math.random()
  if (rand < 0.25) {
    doAction(character, Actions.move, 
        {x: character.x + (Math.random() * 30 - 15), y: character.y + (Math.random() * 30 - 15)})
  } else if (rand < 0.35) {
    doAction(character, Actions.drinkPotion)
  } else {
    // They take a break
    doAction(character, Actions.wait)
  }
}

// This process the game.
function gameLoop() {
  let enemiesNeedingActions = []
  if (!gameState.isPlayerTurn) {
    // if its not the player turn, we count down.
    gameState.turnTimeLeft -= deltaTime
    if (gameState.turnTimeLeft <= 0) {
      // Time to move to the next turn
      gameState.turn++
      for (i = 0; i < tracker.queue.length; i++) {
        const entry = tracker.queue[i]
        entry.turns -= 1;
        // Check if action is done
        if (entry.turns <= 0) {
          // action result
          if (entry.action.onEnd) {
            entry.action.onEnd(entry.state)
          }

          if (entry.character === playerCharacter) {
            gameState.isPlayerTurn = true
          } else {
            enemiesNeedingActions.push(entry.character)
          }
        } else {
          // do the action's overtime effect
          if (entry.action.onTurn) {
            let result = entry.action.onTurn(entry.action.duration - entry.turns, entry.state)
            if (result) {
              entry.state = result
            }
          } 
        }
      }
      // remove done turns from the tracker
      tracker.queue = tracker.queue.filter((entry) => entry.turns > 0 && entry.character.hitpoints > 0)
      // pick new enemy actions 
      enemiesNeedingActions.forEach(pickActionForEnemy)
      gameState.turnTimeLeft = turnTime
      
    }
  }
}

function draw() {
  background(255)
  gameLoop()
  push()
  // Translate all the game screen by the camera
  translate(camera.x, camera.y)
  drawMap()
  drawCharacters();
  pop()
  // UI needs to be drawn last to lay ontop of the game. Also not translated by camera.
  drawUi()
}

function drawMap() {
  // render the grid
  push()
  stroke(225)
  for (i = 0; i <= map.height; i++) {
    line(0, feetToPx(i), feetToPx(map.width), feetToPx(i))
    line(feetToPx(i), 0, feetToPx(i), feetToPx(map.height))
  }
  pop()
}

function drawCharacters() {
  const sortedChars = characters.slice().sort((a,b) => a.y - b.y)
  const hoveredCharacter = getCharacterAtPosition(screenPositionToGamePos({x: mouseX, y: mouseY}))
  for (i = 0; i < sortedChars.length; i++) {
    // render circle
    const c = characters[i]
    push()
    translate(feetToPx(c.x), feetToPx(c.y))
    push()
    ellipseMode(CORNER);
    strokeWeight(3)
    stroke(45)
    if (gameState.uiMode === "selectEntity" && c == hoveredCharacter) {
      stroke(205, 205, 125)
    }
    fill(c.owner.color)
    ellipse(2,2,feetToPx(c.size) - 4, feetToPx(c.size) - 4)
    pop()
    // Now the HP bar
    if (c.hitpoints > 0) {
      let hpWidth = c.hitpoints * 3
      push()
      rectMode(CENTER)
      // shadow
      noStroke()
      translate(feetToPx(c.size / 2) + 2, -10 + 2)
      fill(0,0,0,25)
      rect(0, 0, hpWidth, 8)
      // bar
      strokeWeight(1)
      stroke(185, 225, 185, 225)
      fill(205, 255, 205, 225)
      translate(-2, -2)
      rect(0,0, hpWidth, 8)
      pop()
    }
    // Name
    push()
    translate(feetToPx(c.size / 2) + 2, feetToPx(c.size) + 10 + 2)
    rectMode(CENTER)
    textAlign(CENTER, CENTER)
    fill(0,0,0,25)
    let renderedName = c.name + (c.hitpoints > 0 ? "" : " [DEAD]")
    text(renderedName, 0, 0)
    translate(-2, -2)
    fill(105,105,105,255)
    text(renderedName, 0, 0)
    pop()
    pop()
  }
}

function drawUi() {
  function drawFrameBackground(width, height) {
    push()
    rectMode(CORNER)
    strokeWeight(2)
    stroke(100,100,100)
    fill(235, 235, 235)
    rect(0, 0, width, height)
    pop()
  }

  function drawTitle(txt) {
    textAlign(CENTER,CENTER)
    fill(100,100,100)
    textSize(24)
    textStyle(BOLD)
    text(txt, 0, 0)
  }

  function drawTracker() {
    const trackerWidth = 240
    const trackerHeight = 240
    push()
    translate(width - trackerWidth - 20, 20)
    // background of tracker
    drawFrameBackground(trackerWidth, trackerHeight)
    // Top text
    push()
    translate(trackerWidth / 2, 18)
    drawTitle("Turn: " + gameState.turn)
    pop()
    // draw the progress line at the top
    push()
    rect(1,1, (trackerWidth - 2) * (gameState.turnTimeLeft / turnTime), 2)
    pop()
    // character entries
    push()
    textSize(16)
    translate(0, 36 + 18) // move past title
    const sorted = tracker.queue.slice(0, tracker.queue.length).sort((a, b) => {
      if(a.character.name < b.character.name) { return -1; }
      if(a.character.name > b.character.name) { return 1; }
      return 0; 
    })
    for (i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      push()
      translate(8, 40 * i)
      text(entry.turns, 0, 0)
      translate(18, 0)
      text(entry.character.name, 0,0)
      translate(80, 0)
      text(entry.action.name, 0, 0)
      pop()
    }
    pop()
    pop()
  }

  function drawPlayerUi() {
    const playerActionsHeight = 60
    const playerActionsWidth = 300
    push()
    translate(0, height - playerActionsHeight)
    drawFrameBackground(playerActionsWidth, playerActionsHeight)
    // title
    push()
      translate(playerActionsWidth / 2, 18)
      let title = "Action in Progress"
      if (gameState.isPlayerTurn) {
        title = "Select Action"
        if (gameState.uiMode === "selectLocation") {
          title = "Select Target Location"
        }
        if (gameState.uiMode === "selectEntity") {
          title = "Select Target Enemy"
        }
      }
      drawTitle(title)
    pop()
    translate(0, 40) // move past title

    push()
    if (gameState.isPlayerTurn) {
      // render the player actions
      if (gameState.uiMode === "normal") {
        for (i = 0; i < Actions.list.length; i++ ) {
          let a = Actions.list[i];
          if (a.button === null || a.button === undefined) {
            a.button = createButton(`${a.name}${a.type.range ? ` [${a.type.range}']` : ""} - ${a.duration} turns`)
            a.button.parent("action-buttons")
            a.button.mouseClicked(() => {
              playerDoAction(a)
            })
          }
        }
      }
    } else {
      translate(playerActionsWidth / 2, 0)
      fill(155, 255, 155)
      rectMode(CENTER)
      rect(0, 0, (playerActionsWidth - 50) * (gameState.turnTimeLeft / turnTime), 16)
    }
    pop()
    pop()
  }

  function drawLocationSelector() {
    if (gameState.uiMode === "selectLocation") {
      let hoveredPos = screenPositionToGamePos({x: mouseX, y: mouseY})
      push()
      translate(feetToPx(hoveredPos.x), feetToPx(hoveredPos.y))
      stroke(205, 205, 105, 155)
      fill(255, 255, 155, 155 * (Math.abs(frameCount % 120 - 60) / 60) + 100)
      ellipseMode(CORNER)
      ellipse(0,0,feetToPx(1), feetToPx(1))
      // quad(feetToPx(0.5), 0, feetToPx(1), feetToPx(0.5), feetToPx(0.5), feetToPx(1), 0, feetToPx(0.5))
      pop()
    }
  }

  push()
  // draw the UI components on the board
  translate(camera.x, camera.y)
  drawLocationSelector()
  pop()
  drawTracker()
  drawPlayerUi()
}