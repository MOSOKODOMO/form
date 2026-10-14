const {test} = require('node:test')
const assert = require('node:assert/strict')
const M = require('../dist/room-math.js')

const stage = {width: 1000, height: 600}
const near = (actual, expected, message, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected}`)

test('a big photo is scaled down to fit, and a small one is left alone', () => {
  assert.deepEqual(M.fitWithin(4000, 3000), {width: 1600, height: 1200})
  assert.deepEqual(M.fitWithin(3000, 4000), {width: 1200, height: 1600})
  assert.deepEqual(M.fitWithin(800, 600), {width: 800, height: 600})
})

test('the product starts in the middle at a sensible size, even when it is tall', () => {
  const wide = M.startPlacement(stage, 0.4)
  assert.deepEqual([wide.x, wide.y, wide.rotation], [500, 300, 0])
  near(wide.width, 280, 'a wide product takes 28% of the stage width')
  const tall = M.startPlacement(stage, 2)
  near(tall.width * 2, 240, 'a tall product is held to 40% of the stage height')
})

test('local and world coordinates round-trip at any rotation', () => {
  const placement = {x: 300, y: 200, width: 120, rotation: 33}
  const point = {x: 417, y: 262}
  const back = M.toWorld(M.toLocal(point, placement), placement)
  near(back.x, point.x, 'x')
  near(back.y, point.y, 'y')
})

test('hit testing follows the rotated product, with a little forgiveness for thin handles', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 90}
  // Rotated 90 degrees, a 200 x 40 product is 40 wide and 200 tall on screen.
  assert.equal(M.hitItem({x: 500, y: 390}, placement, 0.2, 0), true)
  assert.equal(M.hitItem({x: 590, y: 300}, placement, 0.2, 0), false)
  assert.equal(M.hitItem({x: 532, y: 300}, placement, 0.2, 0), false)
  assert.equal(M.hitItem({x: 532, y: 300}, placement, 0.2, 14), true, 'padding makes thin products easier to grab')
})

test('the resize and rotate handles are found where they are drawn', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 0}
  const {resize, rotate} = M.handlePoints(placement, 0.5)
  assert.deepEqual([resize.x, resize.y], [600, 350])
  assert.deepEqual([rotate.x, rotate.y], [500, 216])
  assert.equal(M.hitHandle({x: 603, y: 352}, placement, 0.5), 'resize')
  assert.equal(M.hitHandle({x: 500, y: 214}, placement, 0.5), 'rotate')
  assert.equal(M.hitHandle({x: 500, y: 300}, placement, 0.5), null)
})

test('dragging the corner sets the width from the distance to the centre', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 0}
  const {resize} = M.handlePoints(placement, 0.5)
  near(M.widthFromPointer(resize, placement, 0.5, stage), 200, 'unchanged when the pointer is on the handle')
  near(M.widthFromPointer({x: 700, y: 400}, placement, 0.5, stage), 400, 'twice as far, twice as wide')
  assert.equal(M.widthFromPointer({x: 500, y: 300}, placement, 0.5, stage), M.MIN_WIDTH, 'never smaller than the minimum')
  assert.equal(M.widthFromPointer({x: 5000, y: 3000}, placement, 0.5, stage), 1000, 'never wider than the stage')
})

test('the rotate handle turns the product towards the pointer, and snaps near square', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 0}
  assert.equal(M.rotationFromPointer({x: 500, y: 100}, placement), 0, 'straight above is no rotation')
  assert.equal(M.rotationFromPointer({x: 700, y: 300}, placement), 90)
  assert.equal(M.rotationFromPointer({x: 500, y: 500}, placement), 180)
  assert.equal(M.rotationFromPointer({x: 300, y: 300}, placement), -90)
})

test('snapping is within four degrees only', () => {
  const placement = {x: 0, y: 0, width: 100, rotation: 0}
  const at = (degrees) => {
    const radians = (degrees * Math.PI) / 180
    return {x: Math.sin(radians) * 100, y: -Math.cos(radians) * 100}
  }
  assert.equal(M.rotationFromPointer(at(3), placement), 0)
  near(M.rotationFromPointer(at(10), placement), 10, 'ten degrees is left alone')
  near(M.rotationFromPointer(at(10), placement, false), 10, 'no snap when asked')
  near(M.rotationFromPointer(at(2), placement, false), 2, 'unsnapped angles are exact')
})

test('angles wrap to between minus 180 and 180', () => {
  assert.equal(M.normaliseAngle(190), -170)
  assert.equal(M.normaliseAngle(-190), 170)
  assert.equal(M.normaliseAngle(540), 180)
  assert.equal(M.normaliseAngle(0), 0)
})

test('the product stays on the stage when moved', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 0}
  assert.deepEqual(M.moveTo(placement, {x: -50, y: 9999}, stage), {x: 0, y: 600, width: 200, rotation: 0})
})

test('keys move, resize and rotate the product', () => {
  const placement = {x: 500, y: 300, width: 200, rotation: 0}
  assert.equal(M.nudge(placement, 'ArrowRight', {stage}).x, 504)
  assert.equal(M.nudge(placement, 'ArrowUp', {stage, shift: true}).y, 280)
  near(M.nudge(placement, '+', {stage}).width, 210, 'plus grows 5%')
  near(M.nudge(placement, '-', {stage}).width, 200 / 1.05, 'minus shrinks 5%')
  assert.equal(M.nudge(placement, ']', {stage}).rotation, 5)
  assert.equal(M.nudge(placement, '[', {stage, shift: true}).rotation, -15)
  assert.equal(M.nudge(placement, 'a', {stage}), null, 'other keys are left to the browser')
})

test('screen pixels map onto stage pixels when the canvas is scaled by CSS', () => {
  const rect = {left: 100, top: 50, width: 500, height: 300}
  assert.deepEqual(M.toStagePoint(350, 200, rect, stage), {x: 500, y: 300})
})
