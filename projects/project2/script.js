// Züri wie neu
// Every report that people sent to the city of Zürich (litter, graffiti, broken lamps, ...)
// counted in squares of 250 m. Each square is a tile, and the more reports it has,
// the darker and the taller it gets.
//
// cells.csv holds the numbers of all years together, years.csv the same numbers for every
// single year, and borders.csv the borders of the city and its quarters.
// All three files are made from the open data of the city with aggregate.py.

let table;
let yearTable;
let borderTable;

let categories = []; // categories[c] is the name of a category, taken from the header of the CSV
let years = []; // all the years that appear in years.csv
let cells = []; // one object per square, with its position and its numbers
let cellAt = {}; // the same squares, but findable by their coordinates: cellAt["2681750,1247750"]
let groundBorders = []; // the pieces of the borders that lie where there is no square (the lake, the forests)
let totalReports = 0; // the number of all reports, for the title

let cellSize = 250; // the size of a square in metres
let centerE = 2683250,
  centerN = 1248000; // the middle of the map in Swiss coordinates (the main station)
let LAST_DAY = '24 Nov'; // the data of the last year ends on this day

// colours: one blue from light to dark for the numbers, grey ink for all the text
let SURFACE = '#fcfcfb';
let GROUND = '#e6e5df';
let INK = '#0b0b0b';
let INK_SECONDARY = '#52514e';
let INK_MUTED = '#898781';
let HAIRLINE = '#c3c2b7';
let BAR = '#2a78d6';
let BAR_DARK = '#184f95';
let BAR_LIGHT = '#9ec5f4';
let ramp = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
];
let topColors = []; // 256 steps of the ramp, prepared once so that drawing stays fast

// a few names to find your way around, placed with Swiss coordinates
let places = [
  { name: 'Hauptbahnhof', e: 2683150, n: 1248000 },
  { name: 'Langstrasse', e: 2682300, n: 1248290 },
  { name: 'Oerlikon', e: 2683460, n: 1251860 },
  { name: 'Altstetten', e: 2679280, n: 1249470 },
  { name: 'Höngg', e: 2680080, n: 1250730 },
  { name: 'Schwamendingen', e: 2685570, n: 1251060 },
  { name: 'Affoltern', e: 2680670, n: 1252790 },
  { name: 'Seebach', e: 2683670, n: 1252730 },
  { name: 'Witikon', e: 2686650, n: 1246100 },
  { name: 'Wollishofen', e: 2682760, n: 1244680 },
  { name: 'Zürichsee', e: 2683550, n: 1245300 },
];

// the camera
let TOWER_TILT = 0.95; // how far the map is tipped over in the tower view (0 = seen from straight above)
let TOWER_ROTATION = 0.6; // how far the map is turned in the tower view
let MAX_TILT = 1.25;
let MAX_ZOOM = 8;
let rotation = 0,
  rotationTarget = 0;
let tilt = 0,
  tiltTarget = 0;
let zoom = 1,
  zoomTarget = 1;
let panX = 0,
  panY = 0; // the point of the map that sits in the middle of the screen, in squares
let zoomAnchor = null; // the point of the map that should stay under the mouse while zooming

// these are calculated new in every frame, see updateProjection()
let unit; // the size of a square in pixels
let originX, originY; // where the middle of the map is on the screen
let turnCos, turnSin; // the rotation, prepared for the calculations
let flatten; // how much the tilt squeezes the map together from top to bottom
let cornerX = [],
  cornerY = []; // the four corners of a tile, measured from its middle
let sideVisible = [],
  sideShadow = []; // which of the four sides of a tower we see, and how dark they are

// what the user is doing
let selectedCategory = -1; // -1 = all reports, otherwise the index of a category
let selectedYear = 0; // 0 = all years, otherwise a year like 2019
let yearTotals = {}; // yearTotals[year] = the reports of the selected category in that year
let MIN_SCALE = 25; // a selection with very few reports is not stretched to the full height
let maxValue = MIN_SCALE; // the number of reports that gets the full height and the darkest blue
let hovered = null; // the square under the mouse
let selected = null; // the square that was clicked
let pressedOnMap = false;
let dragDistance = 0;
let lastMouseX, lastMouseY; // where the mouse was at the last step of a drag
let CLICK_DISTANCE = 5; // a press that moves less than this many pixels is a click, not a drag

// the interface: the texts are drawn on a second, see-through canvas on top of the map.
// Between the two canvases lie the frosted-glass boxes, which are HTML elements,
// because only HTML can blur what lies behind it.
let canvasElement;
let ui;
let boxes = {}; // boxes[name] = the glass box with that name, and where it is
let categorySelect;
let viewButton;
let zoomInButton, zoomOutButton;
let edge = 16; // the distance of the boxes from the edge of the window
let padding = 16; // the distance of the texts from the edge of their box
let SMALL_SCREEN = 760; // in a window narrower than this, the boxes are arranged for a phone
let GLASS = 'blur(14px) saturate(170%)';
let GLASS_SHADOW =
  'inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 -6px 12px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.2)';
let subtitle =
  ' reports of litter, damage and graffiti that people sent to the city of Zürich, ' +
  '2013 to 2026. This shows where people report, not where the city is dirtiest.';

async function setup() {
  canvasElement = createCanvas(windowWidth, windowHeight);
  textFont('Helvetica');

  // the second canvas lies exactly on top of the first one and lets the mouse through
  ui = createGraphics(windowWidth, windowHeight);
  ui.textFont('Helvetica');
  document.body.appendChild(ui.canvas);
  ui.canvas.style.display = 'block';
  ui.canvas.style.position = 'absolute';
  ui.canvas.style.left = '0';
  ui.canvas.style.top = '0';
  ui.canvas.style.zIndex = '2';
  ui.canvas.style.pointerEvents = 'none';

  table = await loadTable('cells.csv', ',', 'header');
  yearTable = await loadTable('years.csv', ',', 'header');
  borderTable = await loadTable('borders.csv', ',', 'header');

  // the first four columns are e, n, quarter and place, every other column is one category
  for (let column = 4; column < table.getColumnCount(); column++) {
    categories.push(table.columns[column]);
  }

  for (let row = 0; row < table.getRowCount(); row++) {
    let cell = {
      e: table.getNum(row, 0),
      n: table.getNum(row, 1),
      quarter: table.getString(row, 2),
      place: table.getString(row, 3),
      counts: [], // counts[c] = the reports of category c, all years together
      byYear: {}, // byYear[2019] = the same list of numbers, but only for 2019
      borders: [], // the pieces of the borders that cross this square
      level: 0, // how tall the tower is right now, from 0 to 1
      target: 0, // how tall it should become, from 0 to 1
    };

    for (let c = 0; c < categories.length; c++) {
      let count = table.getNum(row, c + 4);
      cell.counts.push(count);
      totalReports += count;
    }

    // the position on the map, measured in squares from the middle (x goes east, y goes north)
    cell.x = (cell.e + cellSize / 2 - centerE) / cellSize;
    cell.y = (cell.n + cellSize / 2 - centerN) / cellSize;

    cells.push(cell);
    cellAt[cell.e + ',' + cell.n] = cell;
  }

  // every row of the years is one square in one year: e, n, year and then the categories again
  for (let row = 0; row < yearTable.getRowCount(); row++) {
    let cell = cellAt[yearTable.getNum(row, 0) + ',' + yearTable.getNum(row, 1)];
    let year = yearTable.getNum(row, 2);

    let counts = [];
    for (let c = 0; c < categories.length; c++) {
      counts.push(yearTable.getNum(row, c + 3));
    }
    cell.byYear[year] = counts;

    if (!years.includes(year)) {
      years.push(year);
    }
  }
  years.sort();

  // every row of the borders is a short line from one point to another, inside one square
  for (let row = 0; row < borderTable.getRowCount(); row++) {
    let e1 = borderTable.getNum(row, 1);
    let n1 = borderTable.getNum(row, 2);
    let e2 = borderTable.getNum(row, 3);
    let n2 = borderTable.getNum(row, 4);

    let piece = {
      city: borderTable.getString(row, 0) == 'city', // the border of the city, or of a quarter?
      x1: (e1 - centerE) / cellSize,
      y1: (n1 - centerN) / cellSize,
      x2: (e2 - centerE) / cellSize,
      y2: (n2 - centerN) / cellSize,
    };

    // the middle of the piece tells which square it lies in
    let e = floor((e1 + e2) / 2 / cellSize) * cellSize;
    let n = floor((n1 + n2) / 2 / cellSize) * cellSize;
    let cell = cellAt[e + ',' + n];
    if (cell) {
      cell.borders.push(piece); // it will be drawn on the roof of this tower
    } else {
      groundBorders.push(piece); // it will be drawn on the ground
    }
  }

  makeColors();
  makeControls();
  applyFilter();

  // start flat and let the towers rise
  tiltTarget = TOWER_TILT;
  rotationTarget = TOWER_ROTATION;
}

// mix the 256 steps of the colour ramp
function makeColors() {
  for (let step = 0; step < 256; step++) {
    // find the two colours of the ramp that this step lies between
    let position = (step / 255) * (ramp.length - 1);
    let index = min(floor(position), ramp.length - 2);
    topColors.push(lerpColor(color(ramp[index]), color(ramp[index + 1]), position - index));
  }
}

function makeControls() {
  // the dropdown lists all reports first and then every category with its number of reports
  categorySelect = createSelect();
  categorySelect.option('All reports (' + formatNumber(totalReports) + ')', -1);
  for (let c = 0; c < categories.length; c++) {
    let sum = 0;
    for (let cell of cells) {
      sum += cell.counts[c];
    }
    categorySelect.option(categories[c] + ' (' + formatNumber(sum) + ')', c);
  }
  categorySelect.changed(applyFilter);

  viewButton = createButton('Flat map');
  viewButton.mouseClicked(switchView);
  viewButton.style('width', '84px');

  // the zoom buttons zoom towards the middle of the window
  zoomOutButton = createButton('−');
  zoomOutButton.mouseClicked(() => zoomBy(1 / 1.5, width / 2, height / 2));
  zoomOutButton.style('width', '32px');
  zoomInButton = createButton('+');
  zoomInButton.mouseClicked(() => zoomBy(1.5, width / 2, height / 2));
  zoomInButton.style('width', '32px');

  for (let control of [categorySelect, viewButton, zoomOutButton, zoomInButton]) {
    control.style('font', '13px Helvetica, Arial, sans-serif');
    control.style('padding', '6px 10px');
    control.style('border', '1px solid ' + HAIRLINE);
    control.style('border-radius', '6px');
    control.style('background', SURFACE);
    control.style('color', INK);
    control.style('cursor', 'pointer');
    control.style('box-sizing', 'border-box');
    control.style('z-index', '3');
  }
  placeControls();

  // a frosted-glass button in the corner that leads back to the intro page, with a fat arrow
  let arrow =
    '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M6 1 L1 6 L6 11 M1.5 6 H15" ' +
    'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let backButton = createA('../../index.html', arrow + 'Back');
  backButton.position(edge, edge);
  backButton.style('display', 'inline-flex');
  backButton.style('align-items', 'center');
  backButton.style('gap', '7px');
  backButton.style('font', '700 13px Helvetica, Arial, sans-serif');
  backButton.style('padding', '9px 16px');
  backButton.style('border-radius', '999px');
  backButton.style('color', INK);
  backButton.style('text-decoration', 'none');
  backButton.style('background', 'rgba(255, 255, 255, 0.16)');
  backButton.style('border', '1px solid rgba(255, 255, 255, 0.45)');
  backButton.style('backdrop-filter', GLASS);
  backButton.style('-webkit-backdrop-filter', GLASS);
  backButton.style('box-shadow', GLASS_SHADOW);
  backButton.style('transition', 'transform 0.3s ease');
  backButton.style('z-index', '3');
  backButton.mouseOver(() => backButton.style('transform', 'scale(1.08)'));
  backButton.mouseOut(() => backButton.style('transform', 'scale(1)'));
}

// the dropdown and the buttons sit in one row at the bottom of the info box
function placeControls() {
  let box = infoBox();
  let x = box.x + padding;

  // the dropdown takes the room that the three buttons leave
  categorySelect.style('width', box.w - 2 * padding - 84 - 32 - 32 - 3 * 8 + 'px');

  for (let control of [categorySelect, viewButton, zoomOutButton, zoomInButton]) {
    control.position(x, box.y + box.h - padding - 30);
    x += control.elt.offsetWidth + 8;
  }
}

// is called when the dropdown or the year changes: every tower gets a new height to grow or shrink to
function applyFilter() {
  selectedCategory = int(categorySelect.value());

  // the timeline shows how many reports of this category every year has
  for (let year of years) {
    yearTotals[year] = 0;
    for (let cell of cells) {
      yearTotals[year] += countOf(cell, selectedCategory, year);
    }
  }

  // the biggest number of a square gets the full height. For a single year this is the
  // biggest number of any year, so that the years can be compared with each other.
  maxValue = MIN_SCALE;
  for (let cell of cells) {
    if (selectedYear == 0) {
      maxValue = max(maxValue, countOf(cell, selectedCategory, 0));
    } else {
      for (let year of years) {
        maxValue = max(maxValue, countOf(cell, selectedCategory, year));
      }
    }
  }

  for (let cell of cells) {
    cell.target = countOf(cell, selectedCategory, selectedYear) / maxValue;
  }
}

// is called when the button is pressed: switch between the flat map and the towers
function switchView() {
  let goal;
  if (tiltTarget > 0.3) {
    tiltTarget = 0;
    goal = 0;
  } else {
    tiltTarget = TOWER_TILT;
    goal = TOWER_ROTATION;
  }

  // if the map was turned around several times, do not spin all the way back
  rotationTarget = goal + round((rotation - goal) / TWO_PI) * TWO_PI;
}

// the number of reports of a square, in one category (-1 = all categories together)
// and in one year (0 = all years together)
function countOf(cell, category, year) {
  let counts = cell.counts;
  if (year != 0) {
    counts = cell.byYear[year];
    if (!counts) {
      return 0; // this square has no report at all in that year
    }
  }

  if (category != -1) {
    return counts[category];
  }
  let sum = 0;
  for (let count of counts) {
    sum += count;
  }
  return sum;
}

function formatNumber(number) {
  return round(number).toLocaleString('en-US');
}

function draw() {
  background(SURFACE);
  ui.clear();

  // wait until the data is loaded
  if (cells.length == 0) {
    return;
  }

  // move the camera and the towers a bit closer to where they should be
  rotation = lerp(rotation, rotationTarget, 0.1);
  tilt = lerp(tilt, tiltTarget, 0.1);
  zoom = lerp(zoom, zoomTarget, 0.2);
  for (let cell of cells) {
    cell.level = lerp(cell.level, cell.target, 0.1);
  }

  updateProjection();
  hovered = findCellUnderMouse();

  // the map
  drawGroundBorders();
  drawCells();
  drawPlaces();

  // the interface on top of it
  hideBoxes();
  drawInfo();
  drawLegend();
  drawTimeline();
  drawPanel();
  drawTooltip();

  // show which view the button leads to
  let label = tiltTarget > 0.3 ? 'Flat map' : 'Towers';
  if (viewButton.html() != label) {
    viewButton.html(label);
  }

  if (pressedOnMap && dragDistance >= CLICK_DISTANCE) {
    cursor('grabbing');
  } else if (hovered || yearUnderMouse() != null) {
    cursor('pointer');
  } else if (mouseOverBox()) {
    cursor('default');
  } else {
    cursor('grab');
  }
}

// calculate where every square is on the screen, for the current rotation, tilt and zoom
function updateProjection() {
  // the map is 51 squares wide and high, 60 and 52 leave some air around it.
  // The tipped map is flatter, so it can be drawn a bit bigger than the flat one.
  unit = min(width / 60, ((height - 60) / 52) * (1 + 0.3 * sin(tilt))) * zoom;
  originX = width / 2;
  originY = height / 2 + 10 + sin(tilt) * height * 0.06;

  // the tallest tower is about a third of the window high
  let towerHeight = height * 0.36 * sin(tilt) * zoom;

  turnCos = cos(rotation);
  turnSin = sin(rotation);
  flatten = cos(tilt);

  // while zooming, move the map so that the point under the mouse stays under the mouse
  if (zoomAnchor) {
    panX = 0;
    panY = 0;
    panX = zoomAnchor.x - toMapX(zoomAnchor.pixelX, zoomAnchor.pixelY);
    panY = zoomAnchor.y - toMapY(zoomAnchor.pixelX, zoomAnchor.pixelY);
    if (abs(zoom - zoomTarget) < 0.001) {
      zoomAnchor = null;
    }
  }
  limitPan();

  for (let cell of cells) {
    cell.screenX = toScreenX(cell.x, cell.y);
    cell.screenY = toScreenY(cell.x, cell.y);
    cell.depth = (cell.x - panX) * turnSin + (cell.y - panY) * turnCos; // how far away the square is
    cell.lift = cell.level * towerHeight; // how many pixels the top of the tower is above the ground
  }

  // every tile has the same shape, so its four corners are calculated only once
  // (a tile is a little smaller than a square, to leave a gap between neighbours)
  let half = 0.46;
  let tileX = [-half, half, half, -half];
  let tileY = [-half, -half, half, half];
  for (let i = 0; i < 4; i++) {
    cornerX[i] = (tileX[i] * turnCos - tileY[i] * turnSin) * unit;
    cornerY[i] = -(tileX[i] * turnSin + tileY[i] * turnCos) * unit * flatten;
  }

  // a tower has four sides (south, east, north, west), we only see the ones that point towards us
  let directionX = [0, 1, 0, -1];
  let directionY = [-1, 0, 1, 0];
  for (let i = 0; i < 4; i++) {
    let turnedX = directionX[i] * turnCos - directionY[i] * turnSin;
    let turnedY = directionX[i] * turnSin + directionY[i] * turnCos;
    sideVisible[i] = turnedY < -0.001;
    sideShadow[i] = 82 - 26 * turnedX; // a side that points to the right lies more in the shadow
  }

  // draw the squares that are far away first, so that the near ones cover them
  cells.sort((a, b) => b.depth - a.depth);
}

// from the map to the screen: x and y are measured in squares from the middle of the map
// (x goes east, y goes north), the result is a position in pixels on the ground
function toScreenX(x, y) {
  return originX + ((x - panX) * turnCos - (y - panY) * turnSin) * unit;
}

function toScreenY(x, y) {
  return originY - ((x - panX) * turnSin + (y - panY) * turnCos) * unit * flatten;
}

// and back from the screen to the map: which point of the ground is at this pixel?
function toMapX(pixelX, pixelY) {
  let turnedX = (pixelX - originX) / unit;
  let turnedY = -(pixelY - originY) / (unit * flatten);
  return panX + turnedX * turnCos + turnedY * turnSin;
}

function toMapY(pixelX, pixelY) {
  let turnedX = (pixelX - originX) / unit;
  let turnedY = -(pixelY - originY) / (unit * flatten);
  return panY - turnedX * turnSin + turnedY * turnCos;
}

// the map can only be moved as far as it is zoomed in, so it never gets lost
function limitPan() {
  let limit = 27 * (1 - 1 / zoom);
  panX = constrain(panX, -limit, limit);
  panY = constrain(panY, -limit, limit);
}

// zoom in or out, and keep the point of the map at this pixel where it is
function zoomBy(factor, pixelX, pixelY) {
  zoomAnchor = { pixelX: pixelX, pixelY: pixelY, x: toMapX(pixelX, pixelY), y: toMapY(pixelX, pixelY) };
  zoomTarget = constrain(zoomTarget * factor, 1, MAX_ZOOM);
}

// the four corners of the top of a tower on the screen: x1, y1, x2, y2, x3, y3, x4, y4
function topOf(cell) {
  let x = cell.screenX;
  let y = cell.screenY - cell.lift;
  return [
    x + cornerX[0],
    y + cornerY[0],
    x + cornerX[1],
    y + cornerY[1],
    x + cornerX[2],
    y + cornerY[2],
    x + cornerX[3],
    y + cornerY[3],
  ];
}

// the four corners of one side of a tower (0 = south, 1 = east, 2 = north, 3 = west)
function sideOf(cell, i) {
  let j = (i + 1) % 4;
  let x = cell.screenX;
  let yGround = cell.screenY;
  let yTop = cell.screenY - cell.lift;
  return [
    x + cornerX[i],
    yGround + cornerY[i],
    x + cornerX[j],
    yGround + cornerY[j],
    x + cornerX[j],
    yTop + cornerY[j],
    x + cornerX[i],
    yTop + cornerY[i],
  ];
}

function drawCells() {
  for (let cell of cells) {
    // the colour follows the square root of the number, so that small numbers
    // do not all look the same next to the few very big ones (see drawLegend)
    let shade = topColors[floor(sqrt(cell.level) * 255)];

    // the selected and the hovered square get an outline
    if (cell == selected) {
      stroke(INK);
      strokeWeight(2);
    } else if (cell == hovered) {
      stroke(INK);
      strokeWeight(1.25);
    } else {
      noStroke();
    }

    // the sides of the tower: first in the colour of the tower, then a see-through shadow on top
    if (cell.lift > 0.5) {
      for (let i = 0; i < 4; i++) {
        if (sideVisible[i]) {
          fill(shade);
          quad(...sideOf(cell, i));
          fill(6, 32, 63, sideShadow[i]);
          quad(...sideOf(cell, i));
        }
      }
    }

    // the top of the tower, squares without reports in this selection stay grey
    if (cell.target == 0 && cell.level < 0.0005) {
      fill(GROUND);
    } else {
      fill(shade);
    }
    quad(...topOf(cell));

    // the borders that cross this square are drawn on its roof
    for (let piece of cell.borders) {
      drawBorder(piece, cell.lift);
    }
  }
  noStroke();
}

// one piece of a border, lifted to the height of the tower it lies on
function drawBorder(piece, lift) {
  if (piece.city) {
    stroke(11, 11, 11, 230);
    strokeWeight(1.6);
  } else {
    stroke(11, 11, 11, 120);
    strokeWeight(0.9);
  }
  line(
    toScreenX(piece.x1, piece.y1),
    toScreenY(piece.x1, piece.y1) - lift,
    toScreenX(piece.x2, piece.y2),
    toScreenY(piece.x2, piece.y2) - lift,
  );
}

function drawGroundBorders() {
  for (let piece of groundBorders) {
    drawBorder(piece, 0);
  }
}

// go through the squares from near to far and return the first one that the mouse touches
function findCellUnderMouse() {
  if (mouseOverBox() || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
    return null;
  }
  if (pressedOnMap && dragDistance >= CLICK_DISTANCE) {
    return null;
  }

  for (let index = cells.length - 1; index >= 0; index--) {
    let cell = cells[index];

    let touched = pointInQuad(mouseX, mouseY, ...topOf(cell));
    if (cell.lift > 0.5) {
      for (let i = 0; i < 4; i++) {
        if (sideVisible[i] && !touched) {
          touched = pointInQuad(mouseX, mouseY, ...sideOf(cell, i));
        }
      }
    }

    if (touched) {
      return cell;
    }
  }
  return null;
}

// a point is inside a four-sided shape if it lies on the same side of all four edges
function pointInQuad(px, py, x1, y1, x2, y2, x3, y3, x4, y4) {
  let a = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  let b = (x3 - x2) * (py - y2) - (y3 - y2) * (px - x2);
  let c = (x4 - x3) * (py - y3) - (y4 - y3) * (px - x3);
  let d = (x1 - x4) * (py - y4) - (y1 - y4) * (px - x4);
  return (a >= 0 && b >= 0 && c >= 0 && d >= 0) || (a <= 0 && b <= 0 && c <= 0 && d <= 0);
}

// the names of the places stand on top of the tower at their position
function drawPlaces() {
  let drawn = []; // the names that are already on the screen, to keep the next ones away from them

  textSize(11);
  textStyle(NORMAL);
  textAlign(CENTER, BOTTOM);

  for (let place of places) {
    let x = (place.e - centerE) / cellSize;
    let y = (place.n - centerN) / cellSize;
    let labelX = toScreenX(x, y);
    let labelY = toScreenY(x, y) - 4;

    // find the square that the place lies in, to know how tall its tower is
    let e = floor(place.e / cellSize) * cellSize;
    let n = floor(place.n / cellSize) * cellSize;
    let cell = cellAt[e + ',' + n];
    if (cell) {
      labelY -= cell.lift;
    }

    // as long as the name would cover another name, move it one line up
    let halfWidth = textWidth(place.name) / 2;
    let moved = true;
    while (moved) {
      moved = false;
      for (let other of drawn) {
        if (abs(labelX - other.x) < halfWidth + other.halfWidth + 4 && abs(labelY - other.y) < 13) {
          labelY = other.y - 13;
          moved = true;
        }
      }
    }
    drawn.push({ x: labelX, y: labelY, halfWidth: halfWidth });

    // a white edge around the letters keeps them readable on top of the tiles:
    // first draw the name with a thick white outline, then once more without
    stroke(SURFACE);
    strokeWeight(3);
    fill(SURFACE);
    text(place.name, labelX, labelY);
    noStroke();
    fill(INK);
    text(place.name, labelX, labelY);
  }
}

// ---------------------------------------------------------------- the glass boxes

// a frosted-glass box behind a part of the interface. It is made once and then
// only moved, and its place is remembered to know when the mouse is over it.
function glass(name, x, y, w, h) {
  if (!boxes[name]) {
    let element = createDiv('');
    element.style('box-sizing', 'border-box');
    element.style('border-radius', '10px');
    element.style('background', 'rgba(255, 255, 255, 0.34)');
    element.style('border', '1px solid rgba(255, 255, 255, 0.6)');
    element.style('backdrop-filter', GLASS);
    element.style('-webkit-backdrop-filter', GLASS);
    element.style('box-shadow', GLASS_SHADOW);
    element.style('pointer-events', 'none');
    element.style('z-index', '1');
    boxes[name] = { element: element };
  }

  let box = boxes[name];
  box.x = x;
  box.y = y;
  box.w = w;
  box.h = h;
  box.visible = true;
  box.element.position(x, y);
  box.element.size(w, h);
  box.element.show();
}

// before the interface is drawn, all boxes are hidden: only the ones that are drawn again come back
function hideBoxes() {
  for (let name in boxes) {
    boxes[name].visible = false;
    boxes[name].element.hide();
  }
}

// is the mouse over one of the boxes? (the tooltip does not count, it follows the mouse)
function mouseOverBox() {
  for (let name in boxes) {
    let box = boxes[name];
    if (
      name != 'tooltip' &&
      box.visible &&
      mouseX > box.x &&
      mouseX < box.x + box.w &&
      mouseY > box.y &&
      mouseY < box.y + box.h
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the info box (top right)

// where the info box is and how big: it holds the title, the text and the row of controls
function infoBox() {
  let small = width < SMALL_SCREEN;
  let w = min(420, width - 2 * edge);

  // how many lines does the text need in a box of this width?
  ui.textSize(13);
  ui.textStyle(NORMAL);
  let lines = ceil(ui.textWidth(formatNumber(totalReports) + subtitle) / ((w - 2 * padding) * 0.9));

  return {
    x: small ? edge : width - edge - w,
    y: small ? 68 : edge,
    w: w,
    h: padding + 32 + lines * 17 + 12 + 30 + padding,
  };
}

function drawInfo() {
  let box = infoBox();
  glass('info', box.x, box.y, box.w, box.h);

  ui.noStroke();
  ui.textAlign(LEFT, TOP);

  ui.fill(INK);
  ui.textSize(22);
  ui.textStyle(BOLD);
  ui.text('Züri wie neu', box.x + padding, box.y + padding);

  ui.fill(INK_SECONDARY);
  ui.textSize(13);
  ui.textStyle(NORMAL);
  ui.textLeading(17);
  ui.text(formatNumber(totalReports) + subtitle, box.x + padding, box.y + padding + 32, box.w - 2 * padding);
}

// ---------------------------------------------------------------- the legend (bottom left)

function drawLegend() {
  let w = 220;
  let boxWidth = w + 2 * padding;
  let boxHeight = 162;
  let boxX = edge;
  let boxY = height - edge - boxHeight;

  // on a small screen the legend sits above the timeline, if there is room and nothing is pinned
  if (width < SMALL_SCREEN) {
    if (selected || height < 760) {
      return;
    }
    boxY = timelineBox().y - 8 - boxHeight;
  }
  glass('legend', boxX, boxY, boxWidth, boxHeight);

  let x = boxX + padding;
  let y = boxY + padding;

  ui.noStroke();
  ui.textAlign(LEFT, TOP);
  ui.textStyle(NORMAL);

  ui.fill(INK);
  ui.textSize(12);
  let name = selectedCategory == -1 ? 'Reports' : categories[selectedCategory];
  ui.text(name + ' per 250 m square' + (selectedYear == 0 ? '' : ', ' + selectedYear), x, y);

  // the colour ramp: its left end is 1 report, its right end the top of the scale
  // (the colour follows the square root of the number, that is why the numbers are not spread evenly)
  let start = sqrt(1 / maxValue);
  for (let i = 0; i < w; i++) {
    let step = start + ((1 - start) * i) / (w - 1);
    ui.fill(topColors[floor(step * 255)]);
    ui.rect(x + i, y + 22, 1.5, 10);
  }

  ui.fill(INK_SECONDARY);
  ui.textSize(11);
  ui.textAlign(LEFT, TOP);
  ui.text('1', x, y + 37);
  ui.textAlign(RIGHT, TOP);
  ui.text(formatNumber(maxValue), x + w, y + 37);

  // one more number in between: a quarter of the top of the scale, at the place where its colour is
  let quarter = round(maxValue / 4);
  let position = (sqrt(quarter / maxValue) - start) / (1 - start);
  ui.textAlign(CENTER, TOP);
  ui.text(formatNumber(quarter), x + position * w, y + 37);

  // the scale is not the same for every selection, so say what the full height stands for
  ui.textAlign(LEFT, TOP);
  ui.text('Full height and darkest blue: ' + formatNumber(maxValue) + ' reports.', x, y + 56);
  ui.text('This scale changes with the category.', x, y + 71);

  // squares that have reports, but none in this selection, are grey
  if (selectedCategory != -1 || selectedYear != 0) {
    ui.fill(GROUND);
    ui.rect(x, y + 91, 10, 10);
    ui.fill(INK_SECONDARY);
    ui.text('No reports in this selection', x + 16, y + 90);
  }

  // where the data comes from
  ui.fill(INK_SECONDARY);
  ui.text('Data: Stadt Zürich, Open Data', x, y + 117);
}

// ---------------------------------------------------------------- the timeline (bottom right)

// where the timeline is and how big: one slot for every year, next to each other
function timelineBox() {
  let slot = min(22, (width - 2 * edge - 2 * padding) / years.length);
  let w = slot * years.length + 2 * padding;
  return { x: width - edge - w, y: height - edge - 136, w: w, h: 136, slot: slot };
}

// the year whose bar is under the mouse, 0 for the "All years" button, null for nothing
function yearUnderMouse() {
  let box = timelineBox();

  // the "All years" button in the top right corner of the box
  if (
    mouseX > box.x + box.w - padding - 70 &&
    mouseX < box.x + box.w - padding &&
    mouseY > box.y + 11 &&
    mouseY < box.y + 33
  ) {
    return 0;
  }

  // the bars: every year reacts in its whole slot, from above the bars down to the labels
  let index = floor((mouseX - box.x - padding) / box.slot);
  if (index >= 0 && index < years.length && mouseY > box.y + 40 && mouseY < box.y + box.h - 8) {
    return years[index];
  }
  return null;
}

// the timeline shows the reports of every year as a bar. A click on a bar shows only that year.
function drawTimeline() {
  let box = timelineBox();
  glass('timeline', box.x, box.y, box.w, box.h);

  let pointed = yearUnderMouse();
  let x = box.x + padding;
  let baseline = box.y + box.h - 30;
  let barHeight = 58;

  // the title of the box, or the number of the year under the mouse
  let name = selectedCategory == -1 ? 'Reports' : categories[selectedCategory];
  let title = name + ' per year';
  if (pointed) {
    title =
      pointed +
      (pointed == years[years.length - 1] ? ' (until ' + LAST_DAY + ')' : '') +
      ': ' +
      formatNumber(yearTotals[pointed]);
  }
  ui.noStroke();
  ui.fill(INK);
  ui.textSize(12);
  ui.textStyle(NORMAL);
  ui.textAlign(LEFT, TOP);
  ui.text(title, x, box.y + padding);

  // the "All years" button is dark while all years are shown
  if (selectedYear == 0) {
    ui.fill(INK);
    ui.noStroke();
  } else {
    ui.noFill();
    ui.stroke(pointed == 0 ? INK : INK_MUTED);
    ui.strokeWeight(1);
  }
  ui.rect(box.x + box.w - padding - 70, box.y + 11, 70, 22, 11);
  ui.noStroke();
  ui.fill(selectedYear == 0 ? SURFACE : INK);
  ui.textSize(11);
  ui.textAlign(CENTER, CENTER);
  ui.text('All years', box.x + box.w - padding - 35, box.y + 22);

  // the tallest bar belongs to the year with the most reports
  let most = 1;
  for (let year of years) {
    most = max(most, yearTotals[year]);
  }

  for (let i = 0; i < years.length; i++) {
    let year = years[i];
    let barX = x + i * box.slot + 3;
    let h = max(1, (yearTotals[year] / most) * barHeight);

    // the selected year is dark and the others step back
    if (selectedYear == 0) {
      ui.fill(BAR);
    } else if (year == selectedYear) {
      ui.fill(BAR_DARK);
    } else {
      ui.fill(BAR_LIGHT);
    }
    if (year == pointed) {
      ui.stroke(INK);
      ui.strokeWeight(1);
    } else {
      ui.noStroke();
    }
    ui.rect(barX, baseline - h, box.slot - 6, h, 3, 3, 0, 0);

    // below every bar the last two digits of its year
    ui.noStroke();
    ui.fill(year == selectedYear ? INK : INK_SECONDARY);
    ui.textSize(10);
    ui.textStyle(year == selectedYear ? BOLD : NORMAL);
    ui.textAlign(CENTER, TOP);
    ui.text("'" + String(year).slice(2), barX + (box.slot - 6) / 2, baseline + 6);
  }
  ui.textStyle(NORMAL);
}

// ---------------------------------------------------------------- the panel of the pinned square

// the panel sits below the back button, or above the timeline on a small screen
function panelBox() {
  let w = min(300, width - 2 * edge);
  let h = 96 + categories.length * 22 + 14;
  if (width < SMALL_SCREEN) {
    return { x: edge, y: timelineBox().y - 8 - h, w: w, h: h };
  }
  return { x: edge, y: 68, w: w, h: h };
}

// the panel lists all categories of the selected square as bars
function drawPanel() {
  if (!selected) {
    return;
  }

  let box = panelBox();
  glass('panel', box.x, box.y, box.w, box.h);
  let x = box.x + padding;
  let y = box.y + padding;

  // where the square is
  ui.noStroke();
  ui.textAlign(LEFT, TOP);
  ui.textStyle(NORMAL);
  ui.textSize(11);
  ui.fill(INK_SECONDARY);
  ui.text('PINNED SQUARE', x, y);

  ui.fill(INK);
  ui.textSize(15);
  ui.textStyle(BOLD);
  ui.text(selected.quarter ? selected.quarter : 'Outside the city', x, y + 18);

  let total = countOf(selected, -1, selectedYear);
  ui.textStyle(NORMAL);
  ui.textSize(12);
  ui.fill(INK_SECONDARY);
  ui.text(
    formatNumber(total) +
      (total == 1 ? ' report' : ' reports') +
      (selectedYear == 0 ? '' : ' in ' + selectedYear) +
      (selected.place ? ', often mentioned: ' + selected.place : ''),
    x,
    y + 42,
  );

  // sort the categories of this square from the biggest to the smallest
  let order = [];
  for (let c = 0; c < categories.length; c++) {
    order.push(c);
  }
  order.sort((a, b) => countOf(selected, b, selectedYear) - countOf(selected, a, selectedYear));
  let biggest = max(1, countOf(selected, order[0], selectedYear));

  let labelWidth = 150;
  let numberWidth = 40;
  let barWidth = box.w - 2 * padding - labelWidth - numberWidth;

  for (let i = 0; i < order.length; i++) {
    let c = order[i];
    let count = countOf(selected, c, selectedYear);
    let rowY = box.y + 96 + i * 22;

    // the category of the dropdown is written in bold
    ui.textAlign(LEFT, CENTER);
    ui.textSize(12);
    ui.textStyle(c == selectedCategory ? BOLD : NORMAL);
    ui.fill(count > 0 ? INK : INK_MUTED);
    ui.text(categories[c], x, rowY);

    ui.fill(BAR);
    ui.rect(x + labelWidth, rowY - 4, (barWidth * count) / biggest, 8, 0, 4, 4, 0);

    ui.textAlign(RIGHT, CENTER);
    ui.fill(count > 0 ? INK : INK_MUTED);
    ui.text(formatNumber(count), box.x + box.w - padding, rowY);
  }
  ui.textStyle(NORMAL);
}

// ---------------------------------------------------------------- the tooltip

// the tooltip follows the mouse and describes the square under it
function drawTooltip() {
  // the pinned square does not need a tooltip, the panel already describes it
  if (!hovered || hovered == selected) {
    return;
  }

  let lines = [];
  let value = countOf(hovered, selectedCategory, selectedYear);
  let total = countOf(hovered, -1, selectedYear);
  let when = selectedYear == 0 ? '' : ' in ' + selectedYear;

  if (total == 0) {
    lines.push('No reports' + when);
  } else if (selectedCategory == -1) {
    // which category has the most reports in this square?
    let top = 0;
    for (let c = 1; c < categories.length; c++) {
      if (countOf(hovered, c, selectedYear) > countOf(hovered, top, selectedYear)) {
        top = c;
      }
    }
    lines.push(formatNumber(value) + (value == 1 ? ' report' : ' reports') + when);
    lines.push('Mostly ' + categories[top] + ' (' + round((countOf(hovered, top, selectedYear) / total) * 100) + '%)');
  } else {
    lines.push(formatNumber(value) + ' × ' + categories[selectedCategory] + when);
    lines.push(
      round((value / total) * 100) +
        '% of the ' +
        formatNumber(total) +
        (total == 1 ? ' report here' : ' reports here'),
    );
  }
  lines.push(hovered.quarter ? 'Quarter: ' + hovered.quarter : 'Outside the city');
  if (hovered.place) {
    lines.push('Often mentioned: ' + hovered.place);
  }

  // measure the lines to know how big the box has to be
  let w = 0;
  for (let i = 0; i < lines.length; i++) {
    ui.textSize(i == 0 ? 14 : 12);
    ui.textStyle(i == 0 ? BOLD : NORMAL);
    w = max(w, ui.textWidth(lines[i]));
  }
  w += 24;
  let h = 22 + lines.length * 18;

  // keep the box inside the window
  let x = mouseX + 16;
  let y = mouseY + 16;
  if (x + w > width - 8) {
    x = mouseX - 16 - w;
  }
  if (y + h > height - 8) {
    y = mouseY - 16 - h;
  }
  x = max(x, 8);
  y = max(y, 8);

  glass('tooltip', x, y, w, h);

  ui.noStroke();
  ui.textAlign(LEFT, TOP);
  for (let i = 0; i < lines.length; i++) {
    ui.textSize(i == 0 ? 14 : 12);
    ui.textStyle(i == 0 ? BOLD : NORMAL);
    ui.fill(i == 0 ? INK : INK_SECONDARY);
    ui.text(lines[i], x + 12, y + 12 + i * 18);
  }
  ui.textStyle(NORMAL);
}

// ---------------------------------------------------------------- mouse and window

function mousePressed(event) {
  pressedOnMap = false;
  dragDistance = 0;
  lastMouseX = mouseX;
  lastMouseY = mouseY;

  // only the main mouse button (or a finger) does something, and only on the canvas
  if (!event || event.button != 0 || event.target != canvasElement.elt) {
    return;
  }

  // a click on the timeline chooses a year, a second click on the same year shows all years again
  let year = yearUnderMouse();
  if (year != null) {
    selectedYear = year == selectedYear ? 0 : year;
    applyFilter();
    return;
  }

  // the map can be dragged everywhere except underneath the boxes
  pressedOnMap = !mouseOverBox();
}

function mouseDragged(event) {
  // stop if the button was let go somewhere we did not notice
  if (event && event.buttons == 0) {
    pressedOnMap = false;
  }
  if (!pressedOnMap) {
    return;
  }
  let dx = mouseX - lastMouseX;
  let dy = mouseY - lastMouseY;
  lastMouseX = mouseX;
  lastMouseY = mouseY;
  dragDistance += abs(dx) + abs(dy);

  if (keyIsDown(SHIFT)) {
    // with the shift key the map is moved: the point under the mouse follows the mouse
    let turnedX = dx / unit;
    let turnedY = -dy / (unit * flatten);
    panX -= turnedX * turnCos + turnedY * turnSin;
    panY -= -turnedX * turnSin + turnedY * turnCos;
    limitPan();
  } else {
    // left and right turns the map (the front follows the mouse),
    // pulling down lifts the camera until it looks straight from above
    rotationTarget += dx * 0.006;
    tiltTarget = constrain(tiltTarget - dy * 0.004, 0, MAX_TILT);
  }
}

function mouseReleased() {
  // a press without movement is a click: pin the square under the mouse, or let go of it
  // (look for the square again here, because on a touch screen there was no hover before the tap)
  if (pressedOnMap && dragDistance < CLICK_DISTANCE) {
    let cell = findCellUnderMouse();
    if (cell == selected) {
      selected = null;
    } else {
      selected = cell;
    }
  }
  pressedOnMap = false;
}

// the mouse wheel (or two fingers on a trackpad) zooms in and out
function mouseWheel(event) {
  if (event.target == canvasElement.elt) {
    // pinching on a trackpad arrives as a wheel with the ctrl key, in much smaller steps
    zoomBy(pow(event.ctrlKey ? 0.98 : 0.998, event.delta), mouseX, mouseY);
    return false; // do not scroll the page
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  ui.resizeCanvas(windowWidth, windowHeight);
  placeControls();
}
