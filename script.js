(function () {
  const COLORS = ['#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#5f27cd', '#ff9ff3', '#00d2d3', '#f368e0', '#ff9f43', '#48dbfb'];

  const ITEMS_STORAGE_KEY = 'pickerWheelItems';
  const MAX_ITEMS = 100;
  const MAX_NAME_LENGTH = 40;
  const MAX_FILE_BYTES = 64 * 1024;
  const DEFAULT_ITEMS = [
    { name: 'Pizza', enabled: true },
    { name: 'Sushi', enabled: true },
    { name: 'Burger', enabled: true },
    { name: 'Tacos', enabled: true },
    { name: 'Salad', enabled: true },
    { name: 'Pasta', enabled: true },
    { name: 'Ramen', enabled: true },
    { name: 'Sandwich', enabled: true }
  ];

  function normalizeItems(value) {
    if (!Array.isArray(value)) throw new Error('Expected a JSON array of items.');
    if (value.length > MAX_ITEMS) throw new Error(`Use at most ${MAX_ITEMS} items.`);
    return value.map((item, index) => {
      if (!item || typeof item.name !== 'string' || typeof item.enabled !== 'boolean') {
        throw new Error(`Item ${index + 1} needs a name and a boolean enabled value.`);
      }
      const name = item.name.trim();
      if (!name || name.length > MAX_NAME_LENGTH) {
        throw new Error(`Item ${index + 1} needs a name of 1-${MAX_NAME_LENGTH} characters.`);
      }
      return { name, enabled: item.enabled };
    });
  }

  function loadItems() {
    let raw = null;
    try {
      raw = localStorage.getItem(ITEMS_STORAGE_KEY);
    } catch (e) {
      // storage can be unavailable (private mode / blocked cookies)
    }
    if (!raw || raw.length > MAX_FILE_BYTES) return DEFAULT_ITEMS.map(it => ({ ...it }));
    try {
      return normalizeItems(JSON.parse(raw));
    } catch (e) {
      // fall through to defaults on malformed stored data
    }
    return DEFAULT_ITEMS.map(it => ({ ...it }));
  }

  function saveItems() {
    try {
      localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // ignore quota/permission errors; wheel still works for this session
    }
  }

  let items = loadItems();

  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const itemListEl = document.getElementById('itemList');
  const newItemInput = document.getElementById('newItemInput');
  const addBtn = document.getElementById('addBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFileInput = document.getElementById('importFileInput');
  const spinBtn = document.getElementById('spinBtn');
  const resultEl = document.getElementById('result');
  const winOverlay = document.getElementById('winOverlay');
  const winName = document.getElementById('winName');
  const winCloseBtn = document.getElementById('winCloseBtn');

  let rotation = 0;      // current total rotation in degrees
  let spinning = false;
  let importing = false;
  let confettiTimeout = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function updateControls() {
    const busy = spinning || importing;
    spinBtn.disabled = busy;
    document.querySelectorAll('.panel input, .panel button').forEach(control => {
      control.disabled = busy;
    });
  }

  const CONFETTI_COLORS = ['#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#5f27cd', '#ff9ff3', '#48dbfb'];

  function launchConfetti(count = 60) {
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
      piece.style.animationDelay = (Math.random() * 0.4) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      winOverlay.appendChild(piece);
      pieces.push(piece);
    }
    clearTimeout(confettiTimeout);
    confettiTimeout = setTimeout(() => {
      pieces.forEach(p => p.remove());
    }, 4200);
  }

  function showWinScreen(name) {
    winName.textContent = name;
    winOverlay.showModal();
    if (!reducedMotion.matches) launchConfetti();
  }

  function hideWinScreen() {
    winOverlay.close();
  }

  winCloseBtn.addEventListener('click', hideWinScreen);
  winOverlay.addEventListener('close', () => {
    clearTimeout(confettiTimeout);
    winOverlay.querySelectorAll('.confetti-piece').forEach(piece => piece.remove());
    spinBtn.focus();
  });
  winOverlay.addEventListener('click', (e) => {
    if (e.target === winOverlay) hideWinScreen();
  });

  function enabledItems() {
    return items.filter(it => it.enabled);
  }

  function colorFor(index) {
    return COLORS[index % COLORS.length];
  }

  function drawWheel() {
    const size = 600;
    const pixelSize = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    ctx.setTransform(pixelSize / size, 0, 0, pixelSize / size, 0, 0);
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 6;

    ctx.clearRect(0, 0, size, size);

    const active = enabledItems();
    const count = active.length;
    canvas.setAttribute('aria-label', `Picker wheel with ${count} enabled items`);

    if (count === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#3d3e4d';
      ctx.fill();
      ctx.fillStyle = '#9a9bb0';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No items enabled', cx, cy);
      return;
    }

    const anglePer = (Math.PI * 2) / count;
    const start = -Math.PI / 2; // 0deg reference is top (12 o'clock)

    active.forEach((item, i) => {
      const a0 = start + i * anglePer;
      const a1 = a0 + anglePer;
      const colorIndex = items.indexOf(item);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colorFor(colorIndex);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // label
      const mid = a0 + anglePer / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colorFor(colorIndex) === '#5f27cd' ? '#fff' : '#1e1f29';
      const labelEnd = radius - 18;
      let fontSize = 20;
      let availableWidth;
      do {
        ctx.font = `bold ${fontSize}px sans-serif`;
        const innerEdge = count > 2 ? fontSize * 0.7 / Math.tan(anglePer / 2) : 0;
        availableWidth = labelEnd - Math.max(size * 0.12, innerEdge);
        if (ctx.measureText(item.name).width <= availableWidth || fontSize === 12) break;
        fontSize -= 1;
      } while (fontSize >= 12);
      const characters = Array.from(item.name);
      let label = item.name;
      while (characters.length && ctx.measureText(label).width > availableWidth) {
        characters.pop();
        label = characters.join('') + '…';
      }
      if (characters.length && ctx.measureText(label).width <= availableWidth) {
        ctx.fillText(label, labelEnd, 0);
      }
      ctx.restore();
    });
  }

  function renderItemList() {
    itemListEl.innerHTML = '';

    if (items.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'No items yet. Add one below.';
      itemListEl.appendChild(hint);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'item-row' + (item.enabled ? '' : ' disabled');

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = colorFor(index);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.enabled;
      checkbox.id = 'item-' + index;
      checkbox.addEventListener('change', () => {
        if (spinning || importing) return;
        item.enabled = checkbox.checked;
        row.classList.toggle('disabled', !item.enabled);
        drawWheel();
        saveItems();
      });

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = item.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove item';
      removeBtn.setAttribute('aria-label', `Remove ${item.name}`);
      removeBtn.addEventListener('click', () => {
        if (spinning || importing) return;
        items.splice(index, 1);
        renderItemList();
        drawWheel();
        saveItems();
      });

      row.appendChild(swatch);
      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(removeBtn);
      itemListEl.appendChild(row);
    });
  }

  function addItem() {
    if (spinning || importing) return;
    try {
      items = normalizeItems([...items, { name: newItemInput.value, enabled: true }]);
    } catch (error) {
      resultEl.textContent = error.message;
      return;
    }
    newItemInput.value = '';
    renderItemList();
    drawWheel();
    saveItems();
    newItemInput.focus();
  }

  addBtn.addEventListener('click', addItem);
  newItemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  function exportItems() {
    const dataStr = JSON.stringify(items, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'picker-wheel-items.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importItemsFromFile(file) {
    if (spinning || importing) return;
    if (file.size > MAX_FILE_BYTES) {
      resultEl.textContent = 'Could not import file: maximum size is 64 KiB.';
      return;
    }
    importing = true;
    updateControls();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        items = normalizeItems(JSON.parse(reader.result));
        renderItemList();
        drawWheel();
        saveItems();
        resultEl.textContent = 'Items imported.';
      } catch (error) {
        resultEl.textContent = error instanceof SyntaxError
          ? 'Could not import file: invalid JSON.'
          : `Could not import file: ${error.message}`;
      } finally {
        importing = false;
        updateControls();
      }
    };
    reader.onerror = () => {
      resultEl.textContent = 'Could not read file.';
      importing = false;
      updateControls();
    };
    reader.onabort = () => {
      importing = false;
      updateControls();
    };
    reader.readAsText(file);
  }

  exportBtn.addEventListener('click', exportItems);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if (file) importItemsFromFile(file);
    importFileInput.value = '';
  });

  function spin() {
    if (spinning || importing) return;
    const active = enabledItems();
    if (active.length === 0) {
      resultEl.textContent = 'Enable at least one item to spin.';
      return;
    }

    spinning = true;
    updateControls();
    resultEl.textContent = '';

    const count = active.length;
    const anglePerDeg = 360 / count;
    const winnerIndex = Math.floor(Math.random() * count);
    const winner = active[winnerIndex];

    // Center angle of the winning segment in the wheel's own (unrotated) coordinate
    // space, measured clockwise from the top (12 o'clock = 0deg).
    const segmentCenterDeg = winnerIndex * anglePerDeg + anglePerDeg / 2;
    // Small random jitter within the segment so it doesn't always land dead-center.
    const jitter = (Math.random() - 0.5) * (anglePerDeg * 0.6);
    const targetDeg = segmentCenterDeg + jitter;

    // We need: (rotation + targetDeg) mod 360 === 0  (so that segment sits at pointer/top)
    // Solve for the smallest forward rotation satisfying that, then add extra full spins.
    const currentMod = ((rotation % 360) + 360) % 360;
    let delta = (360 - ((currentMod + targetDeg) % 360)) % 360;
    const extraSpins = 6 + Math.floor(Math.random() * 3); // 6-8 full turns
    const totalDelta = delta + extraSpins * 360;

    const startRotation = rotation;
    const endRotation = rotation + totalDelta;
    const duration = reducedMotion.matches ? 0 : 4200;
    const startTime = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = duration === 0 ? 1 : Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      rotation = startRotation + totalDelta * eased;
      canvas.style.transform = `rotate(${rotation}deg)`;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        rotation = endRotation;
        spinning = false;
        updateControls();
        resultEl.textContent = '🎉 ' + winner.name;
        showWinScreen(winner.name);
      }
    }

    requestAnimationFrame(animate);
  }

  spinBtn.addEventListener('click', spin);

  renderItemList();
  drawWheel();
  new ResizeObserver(drawWheel).observe(canvas);
  window.addEventListener('resize', drawWheel);
})();
