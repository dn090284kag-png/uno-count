/**
 * UNO SCORE TRACKER
 * Повнофункціональний веб-додаток для підрахунку балів у грі UNO
 */

// ==========================================================================
// КОНФІГУРАЦІЯ ТА КОЛЬОРИ
// ==========================================================================

const PLAYER_COLORS = [
  { name: 'Червоний', hex: '#e53935', icon: '🔴' },
  { name: 'Синій', hex: '#1976d2', icon: '🔵' },
  { name: 'Зелений', hex: '#2e7d32', icon: '🟢' },
  { name: 'Жовтий', hex: '#fbc02d', icon: '🟡' },
  { name: 'Фіолетовий', hex: '#8e24aa', icon: '🟣' },
  { name: 'Помаранчевий', hex: '#f57c00', icon: '🟠' },
  { name: 'Бірюзовий', hex: '#00897b', icon: '🩵' },
  { name: 'Рожевий', hex: '#d81b60', icon: '🩷' },
  { name: 'Індиго', hex: '#3949ab', icon: '🔷' },
  { name: 'Лайм', hex: '#7cb342', icon: '🍏' },
  { name: 'Бурштиновий', hex: '#ff8f00', icon: '🔶' },
  { name: 'Кораловий', hex: '#ff5722', icon: '🪸' }
];

const STORAGE_KEYS = {
  CURRENT_GAME: 'uno_current_game_v1',
  SAVED_GAMES: 'uno_saved_games_v1',
  RECENT_PLAYERS: 'uno_recent_players_v1'
};

// ==========================================================================
// СТАН ДОДАТКУ
// ==========================================================================

let appState = {
  // Налаштування гри
  mode: 'penalty', // 'penalty' або 'classic'
  targetScore: 500,
  players: [], // [{ id, name, color, icon }]
  rounds: [],  // [{ id, roundNum, winnerId, scores: { playerId: number }, timestamp }]
  status: 'setup', // 'setup', 'playing', 'gameover'
  winnerId: null,
  activeView: 'cards', // 'cards' або 'table'
  currentScreen: 'setupScreen',
  screenScrollY: 0,
  screenScrollPositions: {},
  currentModal: null
};

// Тимчасовий стан модальних вікон
let roundModalState = {
  isEditing: false,
  editingRoundId: null,
  selectedWinnerId: null,
  scores: {} // { playerId: number }
};

let calcState = {
  playerId: null,
  cards: [], // [{ val: number, label: string }]
  total: 0
};

let modalScrollPosition = null;

let currentColorIndex = 0;

// ==========================================================================
// ІНІЦІАЛІЗАЦІЯ ПРИ ЗАВАНТАЖЕННІ
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  updateModalViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateModalViewport);
    window.visualViewport.addEventListener('scroll', updateModalViewport);
  }
  window.addEventListener('scroll', saveCurrentScreenScroll, { passive: true });
  window.addEventListener('beforeunload', saveCurrentScreenScroll);
  setupEventListeners();
  loadSavedGameState();
  loadRecentPlayers();
  registerServiceWorker();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('UNO Service Worker зареєстровано'))
      .catch(err => console.log('SW registration:', err));
  }
}


// ==========================================================================
// ОБРОБНИКИ ПОДІЙ (EVENT LISTENERS)
// ==========================================================================

function setupEventListeners() {
  // Кнопки навігації
  document.getElementById('btnRules').addEventListener('click', () => {
    openModal('rulesModal');
  });

  document.getElementById('btnHistory').addEventListener('click', () => {
    renderHistoryModal();
    openModal('historyModal');
  });

  document.getElementById('btnShareGame').addEventListener('click', () => {
    prepareShareModal();
    openModal('shareModal');
  });

  document.getElementById('btnNewGamePrompt').addEventListener('click', () => {
    if (confirm('Справді розпочати нову гру? Поточні результати буде збережено в історію.')) {
      archiveCurrentGame();
      resetToSetup(true);
    }
  });

  // Закриття модалок по кліку на хрестик або бекдроп
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });

  // ====================== НАЛАШТУВАННЯ ГРИ ======================
  // Вибір кольору нового гравця
  document.getElementById('btnColorPicker').addEventListener('click', () => {
    currentColorIndex = (currentColorIndex + 1) % PLAYER_COLORS.length;
    updateColorPickerUI();
  });

  // Додавання гравця
  const inputPlayerName = document.getElementById('newPlayerName');
  document.getElementById('btnAddPlayer').addEventListener('click', () => {
    addNewPlayer();
  });

  inputPlayerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewPlayer();
    }
  });

  // Пресети цільового ліміту
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.dataset.target, 10);
      appState.targetScore = val;
      document.getElementById('customTargetScore').value = '';
    });
  });

  document.getElementById('customTargetScore').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      appState.targetScore = val;
    }
  });

  // Зміна режиму гри
  document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      appState.mode = e.target.value;
      updateGameModeLabels();
    });
  });

  // Почати гру
  document.getElementById('btnStartGame').addEventListener('click', () => {
    if (appState.players.length < 2) {
      showToast('Додайте щонайменше 2 гравців!');
      return;
    }
    startGame();
  });

  // ====================== ЕКРАН ГРИ ======================
  document.getElementById('btnOpenAddRoundModal').addEventListener('click', () => {
    openAddRoundModal();
  });

  document.getElementById('btnSaveRound').addEventListener('click', () => {
    saveRoundFromModal();
  });

  document.getElementById('btnUndoRound').addEventListener('click', () => {
    undoLastRound();
  });

  document.getElementById('btnToggleTableView').addEventListener('click', () => {
    toggleTableView();
  });

  // Дострокове завершення гри
  document.getElementById('btnEarlyFinish').addEventListener('click', () => {
    if (appState.rounds.length === 0) {
      showToast('Ще не зіграно жодного раунду!');
      return;
    }
    if (confirm('Дійсно завершити партію достроково прямо зараз та визначити переможця за поточними балами?')) {
      const { ranked } = getPlayerStats();
      triggerGameOver(ranked[0], ranked);
    }
  });

  // Вибір при перевищенні ліміту: продовжити (+200)
  document.getElementById('btnExtendLimit').addEventListener('click', () => {
    closeModal('limitExceededModal');
    const oldLimit = appState.targetScore;
    appState.targetScore += 200;
    saveGameState();
    renderGameUI();
    showToast(`🚀 Ліміт гри збільшено з ${oldLimit} до ${appState.targetScore} б.! Граємо далі!`);
  });

  // Вибір при перевищенні ліміту: завершити гру
  document.getElementById('btnFinishGameNow').addEventListener('click', () => {
    closeModal('limitExceededModal');
    const winner = (pendingRanked && pendingRanked.length > 0) ? pendingRanked[0] : getPlayerStats().ranked[0];
    triggerGameOver(winner, (pendingRanked && pendingRanked.length > 0) ? pendingRanked : getPlayerStats().ranked);
  });

  // ====================== КАЛЬКУЛЯТОР КАРТ ======================
  document.querySelectorAll('.uno-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.val, 10);
      const label = btn.dataset.label || btn.innerText.trim();
      addCardToCalc(val, label);
    });
  });

  document.getElementById('btnCalcClear').addEventListener('click', () => {
    clearCalc();
  });

  document.getElementById('btnCalcUndo').addEventListener('click', () => {
    undoCalcCard();
  });

  document.getElementById('btnApplyCalc').addEventListener('click', () => {
    applyCalcResult();
  });

  // ====================== BURN MODAL ======================
  document.getElementById('btnCloseBurn').addEventListener('click', () => {
    closeModal('burnModal');
    burnShowing = false;
    // Show next burned player if any
    showNextBurn();
  });

  // ====================== МОДАЛКА ПЕРЕМОГИ ======================
  document.getElementById('btnStartNewAfterVictory').addEventListener('click', () => {
    closeModal('gameOverModal');
    archiveCurrentGame();
    resetToSetup(true);
  });

  document.getElementById('btnShareGameOver').addEventListener('click', () => {
    copyShareTextToClipboard();
  });

  // ====================== ЕКСПОРТ ТА ІСТОРІЯ ======================
  document.getElementById('btnCopyShareText').addEventListener('click', () => {
    copyShareTextToClipboard();
  });

  document.getElementById('btnDownloadCSV').addEventListener('click', () => {
    downloadCSV();
  });

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    if (confirm('Очистити всю історію збережених ігор?')) {
      localStorage.removeItem(STORAGE_KEYS.SAVED_GAMES);
      renderHistoryModal();
      showToast('Історію очищено');
    }
  });
}

// ==========================================================================
// УПРАВЛІННЯ НАЛАШТУВАННЯМИ ТА ГРАВЦЯМИ
// ==========================================================================

function updateColorPickerUI() {
  const color = PLAYER_COLORS[currentColorIndex];
  const btn = document.getElementById('btnColorPicker');
  const icon = document.getElementById('playerAvatarIcon');
  btn.style.backgroundColor = color.hex;
  icon.textContent = color.icon;
}

function addNewPlayer(nameOverride = null) {
  const input = document.getElementById('newPlayerName');
  const name = (nameOverride || input.value).trim();

  if (!name) {
    showToast('Введіть ім\'я гравця!');
    input.focus();
    return;
  }

  // Перевірка на дублікати
  if (appState.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Гравець з таким ім\'ям вже є!');
    input.focus();
    return;
  }

  if (appState.players.length >= 12) {
    showToast('Максимум 12 гравців!');
    return;
  }

  const color = PLAYER_COLORS[currentColorIndex];
  const newPlayer = {
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name,
    color: color.hex,
    icon: color.icon
  };

  appState.players.push(newPlayer);
  saveRecentPlayer(name);

  // Наступний колір
  currentColorIndex = (currentColorIndex + 1) % PLAYER_COLORS.length;
  updateColorPickerUI();

  if (!nameOverride) {
    input.value = '';
    input.focus();
  }

  renderPlayersList();
  updateStartGameButton();
}

function removePlayer(playerId) {
  appState.players = appState.players.filter(p => p.id !== playerId);
  renderPlayersList();
  updateStartGameButton();
}

function renderPlayersList() {
  const container = document.getElementById('playersList');
  container.innerHTML = '';

  appState.players.forEach(player => {
    const item = document.createElement('div');
    item.className = 'player-item-badge';
    item.innerHTML = `
      <div class="player-item-left">
        <span class="player-dot" style="background-color: ${player.color}"></span>
        <span class="player-name-text">${escapeHtml(player.name)}</span>
      </div>
      <button type="button" class="btn-remove-player" title="Видалити" aria-label="Видалити">✕</button>
    `;

    item.querySelector('.btn-remove-player').addEventListener('click', () => {
      removePlayer(player.id);
    });

    container.appendChild(item);
  });
}

function updateStartGameButton() {
  const btn = document.getElementById('btnStartGame');
  btn.disabled = appState.players.length < 2;
  if (appState.players.length >= 2) {
    btn.innerHTML = `<span>🚀 Почати гру (${appState.players.length} гравців)</span>`;
  } else {
    btn.innerHTML = `<span>🚀 Почати гру (потрібно мін. 2 гравці)</span>`;
  }
}

function updateGameModeLabels() {
  const isPenalty = appState.mode === 'penalty';
  const label = document.getElementById('targetScoreLabel');
  if (isPenalty) {
    label.textContent = 'Ліміт штрафних балів для завершення гри:';
    document.getElementById('leaderboardHint').textContent = 'Хто набере менше — перемагає';
  } else {
    label.textContent = 'Ціль балів для перемоги:';
    document.getElementById('leaderboardHint').textContent = 'Хто перший набере потрібні очки — перемагає';
  }
}

function saveRecentPlayer(name) {
  try {
    let recent = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_PLAYERS) || '[]');
    recent = recent.filter(n => n.toLowerCase() !== name.toLowerCase());
    recent.unshift(name);
    if (recent.length > 12) recent.pop();
    localStorage.setItem(STORAGE_KEYS.RECENT_PLAYERS, JSON.stringify(recent));
    loadRecentPlayers();
  } catch (e) {
    console.error(e);
  }
}

function loadRecentPlayers() {
  try {
    const recent = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_PLAYERS) || '[]');
    const container = document.getElementById('recentPlayersContainer');
    const list = document.getElementById('recentPlayersList');

    if (!recent || recent.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    list.innerHTML = '';

    recent.forEach(name => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-btn';
      chip.textContent = '+ ' + name;
      chip.addEventListener('click', () => {
        addNewPlayer(name);
      });
      list.appendChild(chip);
    });
  } catch (e) {
    console.error(e);
  }
}

// ==========================================================================
// ЗАПУСК ТА ПЕРЕМИКАННЯ ЕКРАНІВ ГРИ
// ==========================================================================

function startGame() {
  appState.status = 'playing';
  appState.rounds = [];
  appState.winnerId = null;

  saveGameState();

  showScreen('gameScreen');
  renderGameUI();
  showToast('🎮 Гру розпочато! Гарної партії!');
}

function resetToSetup(keepPlayers = false) {
  appState.status = 'setup';
  appState.rounds = [];
  appState.winnerId = null;
  if (!keepPlayers) {
    appState.players = [];
  }

  saveGameState();
  showScreen('setupScreen');
  renderPlayersList();
  updateStartGameButton();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (appState.currentScreen && appState.currentScreen !== screenId) {
    appState.screenScrollPositions[appState.currentScreen] = window.scrollY;
  }
  appState.currentScreen = screenId;
  appState.screenScrollY = appState.screenScrollPositions[screenId] || 0;

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: appState.screenScrollY, left: 0, behavior: 'auto' });
  });
  saveGameState();

  const btnShare = document.getElementById('btnShareGame');
  const btnNewPrompt = document.getElementById('btnNewGamePrompt');

  if (screenId === 'gameScreen') {
    btnShare.classList.remove('hidden');
    btnNewPrompt.classList.remove('hidden');
    document.getElementById('headerSubtitle').textContent = `Раунд ${appState.rounds.length + 1}`;
  } else {
    btnShare.classList.add('hidden');
    btnNewPrompt.classList.add('hidden');
    document.getElementById('headerSubtitle').textContent = 'Підрахунок балів';
  }
}

// ==========================================================================
// ВІДОБРАЖЕННЯ ІГРОВОГО ПРОЦЕСУ (LEADERBOARD & TABLE)
// ==========================================================================

function getPlayerStats() {
  const totals = {};
  const roundsWon = {};
  const burnsCount = {};
  const roundBurns = {}; // { [roundId]: { [playerId]: boolean } }

  appState.players.forEach(p => {
    totals[p.id] = 0;
    roundsWon[p.id] = 0;
    burnsCount[p.id] = 0;
  });

  appState.rounds.forEach(round => {
    roundBurns[round.id] = {};

    if (round.winnerId && roundsWon[round.winnerId] !== undefined) {
      roundsWon[round.winnerId]++;
    }
    Object.keys(round.scores).forEach(pId => {
      if (totals[pId] !== undefined) {
        totals[pId] += (round.scores[pId] || 0);

        // Якщо рівно ліміт балів - ОЧКИ ЗГОРАЮТЬ (стає 0)
        if (totals[pId] === appState.targetScore) {
          totals[pId] = 0;
          burnsCount[pId] = (burnsCount[pId] || 0) + 1;
          roundBurns[round.id][pId] = true;
        }
      }
    });
  });

  // Сортування
  const sorted = [...appState.players].map(p => ({
    ...p,
    total: totals[p.id] || 0,
    wins: roundsWon[p.id] || 0,
    burns: burnsCount[p.id] || 0,
    toBurn: appState.targetScore - (totals[p.id] || 0)
  }));

  if (appState.mode === 'penalty') {
    // У штрафному режимі чим менше очок, тим вище місце
    sorted.sort((a, b) => a.total - b.total || b.wins - a.wins);
  } else {
    // У класичному чим більше, тим краще
    sorted.sort((a, b) => b.total - a.total || b.wins - a.wins);
  }

  return { totals, roundsWon, burnsCount, roundBurns, ranked: sorted };
}

function getPlayerScoreBeforeRound(playerId, targetRoundId = null) {
  let total = 0;
  for (let r of appState.rounds) {
    if (targetRoundId && r.id === targetRoundId) {
      break;
    }
    total += (r.scores[playerId] || 0);
    if (total === appState.targetScore) {
      total = 0; // згоріло в попередньому раунді
    }
  }
  return total;
}

function renderGameUI() {
  // Мета панель
  const modeBadge = document.getElementById('gameModeBadge');
  modeBadge.textContent = appState.mode === 'penalty' ? 'Штрафні (Пенальті)' : 'Класичний';

  const limitBadge = document.getElementById('gameLimitBadge');
  limitBadge.textContent = `${appState.targetScore} б.`;

  const roundBadge = document.getElementById('currentRoundBadge');
  roundBadge.textContent = (appState.rounds.length + 1).toString();

  document.getElementById('headerSubtitle').textContent = `Раунд ${appState.rounds.length + 1}`;

  const { totals, roundsWon, roundBurns, ranked } = getPlayerStats();

  renderLeaderboard(ranked);
  renderScoreTable(totals, roundBurns);
  restoreActiveGameView();

  // Кнопка скасування раунду
  const btnUndo = document.getElementById('btnUndoRound');
  btnUndo.disabled = appState.rounds.length === 0;

  // Перевірка завершення гри
  checkGameEndCondition(ranked);
}

function renderLeaderboard(ranked) {
  const container = document.getElementById('playersLeaderboard');
  container.innerHTML = '';

  const bestScore = ranked[0] ? ranked[0].total : 0;
  const isPenalty = appState.mode === 'penalty';

  ranked.forEach((player, index) => {
    const rank = index + 1;
    const card = document.createElement('div');
    card.className = `player-card rank-${rank}`;

    // Розрахунок прогресу до ліміту
    const percent = Math.max(0, Math.min(100, Math.round((player.total / appState.targetScore) * 100)));
    let progressClass = '';
    if (isPenalty) {
      if (percent >= 85) progressClass = 'danger';
      else if (percent >= 60) progressClass = 'warn';
    } else {
      if (percent >= 80) progressClass = 'danger'; // близько до перемоги
      else if (percent >= 50) progressClass = 'warn';
    }

    if (percent >= 85 && isPenalty) {
      card.classList.add('danger');
    }

    // Медалі
    let medal = `${rank}`;
    if (rank === 1) medal = '🥇 1-е';
    else if (rank === 2) medal = '🥈 2-е';
    else if (rank === 3) medal = '🥉 3-є';
    else medal = `${rank}-е`;

    // Різниця з лідером
    let diffText = '';
    if (rank > 1) {
      const diff = Math.abs(player.total - bestScore);
      diffText = isPenalty ? `+${diff} від лідера` : `-${diff} від лідера`;
    } else {
      if (player.total < 0) {
        diffText = '🖤 Бонусний мінус! Лідер';
      } else {
        diffText = '🏆 Лідер гри';
      }
    }

    const isNegative = player.total < 0;
    const toBurn = player.toBurn;
    const isCloseToBurn = toBurn > 0 && toBurn <= 60;

    card.innerHTML = `
      <div class="card-top-row">
        <span class="card-rank-badge">${medal} місце</span>
        <div class="card-badges-group">
          ${player.burns > 0 ? `<span class="player-burns-tag" title="Очки згорали ${player.burns} разів!">🔥 ${player.burns} згорань</span>` : ''}
          <span class="player-rounds-won">Перемог: <strong>${player.wins}</strong></span>
        </div>
      </div>
      <div class="player-info-row">
        <div class="player-avatar-circle" style="background-color: ${player.color}">
          ${player.name.charAt(0).toUpperCase()}
        </div>
        <div class="player-meta">
          <div class="player-card-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>
          <div class="score-diff">${diffText}</div>
        </div>
      </div>

      <!-- Блок різниці: Ліміт - поточні бали (до згорання) -->
      <div class="burn-counter-strip ${isCloseToBurn ? 'burn-close' : ''}">
        <div class="burn-counter-left">
          <span class="burn-fire-icon">🔥</span>
          <span class="burn-caption">До згорання суми (${appState.targetScore}):</span>
        </div>
        <div class="burn-counter-val">
          <strong>${toBurn}</strong> <span class="burn-unit">б.</span>
        </div>
      </div>

      <div class="score-display-row">
        <div>
          <span class="score-big ${isNegative ? 'score-negative-text' : ''}">${player.total}</span>
          <span class="score-pts">балів</span>
        </div>
        <div class="score-diff">${isNegative ? 'В мінусі (супер!)' : `${percent}% від ліміту`}</div>
      </div>
      <div class="progress-container" title="${player.total} з ${appState.targetScore} б.">
        <div class="progress-fill ${progressClass}" style="width: ${percent}%"></div>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderScoreTable(totals, roundBurns = {}) {
  const headerRow = document.getElementById('tableHeaderRow');
  const body = document.getElementById('tableBody');
  const footerRow = document.getElementById('tableFooterRow');
  const emptyState = document.getElementById('emptyTableMessage');
  const table = document.getElementById('unoScoreTable');

  // Очищення колонок гравців у шапці
  headerRow.innerHTML = `<th class="col-round">#</th>`;
  appState.players.forEach(player => {
    const th = document.createElement('th');
    th.innerHTML = `
      <div class="player-th-badge">
        <span class="player-th-dot" style="background-color: ${player.color}"></span>
        <span>${escapeHtml(player.name)}</span>
      </div>
    `;
    headerRow.appendChild(th);
  });
  headerRow.innerHTML += `<th class="col-actions">Дії</th>`;

  // Рядки раундів
  body.innerHTML = '';
  if (appState.rounds.length === 0) {
    emptyState.classList.remove('hidden');
    table.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    table.classList.remove('hidden');

    appState.rounds.forEach((round, rIndex) => {
      const tr = document.createElement('tr');

      let html = `<td class="col-round">Р${rIndex + 1}</td>`;

      appState.players.forEach(player => {
        const score = round.scores[player.id] !== undefined ? round.scores[player.id] : 0;
        const isWinner = round.winnerId === player.id;
        const burned = roundBurns[round.id] && roundBurns[round.id][player.id];

        if (isWinner) {
          const isBonus = score < 0;
          html += `
            <td class="cell-winner ${isBonus ? 'has-black-bonus' : ''} ${burned ? 'cell-burned' : ''}">
              <span class="cell-winner-badge" title="${burned ? `ОЧКИ ЗГОРІЛИ ДО 0! (Було рівно ${appState.targetScore})` : (isBonus ? `Переможець із бонусом чорної карти: ${score}` : 'Переможець раунду')}">
                🏆 ${score} ${burned ? '🔥 (0)' : (isBonus ? '🖤' : '')}
              </span>
            </td>
          `;
        } else {
          const isNegative = score < 0;
          html += `
            <td class="cell-score ${isNegative ? 'score-negative-cell' : ''} ${burned ? 'cell-burned' : ''}" title="${burned ? `Очки досягли рівно ${appState.targetScore} і згоріли до 0!` : ''}">
              ${burned ? `${score} 🔥 (0)` : score}
            </td>
          `;
        }
      });

      html += `
        <td class="col-actions">
          <button type="button" class="btn-table-action btn-edit-round" data-round-id="${round.id}" title="Редагувати раунд">✏️</button>
          <button type="button" class="btn-table-action btn-delete-round" data-round-id="${round.id}" title="Видалити раунд">🗑️</button>
        </td>
      `;

      tr.innerHTML = html;

      // Події редагування та видалення
      tr.querySelector('.btn-edit-round').addEventListener('click', () => {
        openEditRoundModal(round.id);
      });
      tr.querySelector('.btn-delete-round').addEventListener('click', () => {
        deleteRound(round.id);
      });

      body.appendChild(tr);
    });
  }

  // Футер: підсумки
  footerRow.innerHTML = `<th class="col-round">РАЗОМ</th>`;
  appState.players.forEach(player => {
    const total = totals[player.id] || 0;
    footerRow.innerHTML += `<td>${total}</td>`;
  });
  footerRow.innerHTML += `<th class="col-actions"></th>`;
}

function toggleTableView() {
  const cardsSec = document.getElementById('leaderboardSection');
  const tableSec = document.getElementById('scoreTableSection');
  const btnText = document.getElementById('viewModeText');
  const btnIcon = document.getElementById('viewModeIcon');

  if (appState.activeView === 'cards') {
    appState.activeView = 'table';
    cardsSec.classList.add('hidden');
    tableSec.scrollIntoView({ behavior: 'smooth' });
    btnText.textContent = 'Картки';
    btnIcon.textContent = '🃏';
  } else {
    appState.activeView = 'cards';
    cardsSec.classList.remove('hidden');
    btnText.textContent = 'Таблиця';
    btnIcon.textContent = '📋';
  }
  saveGameState();
}

function restoreActiveGameView() {
  const cardsSec = document.getElementById('leaderboardSection');
  const tableSec = document.getElementById('scoreTableSection');
  const btnText = document.getElementById('viewModeText');
  const btnIcon = document.getElementById('viewModeIcon');

  if (!cardsSec || !tableSec || !btnText || !btnIcon) return;

  if (appState.activeView === 'table') {
    cardsSec.classList.add('hidden');
    tableSec.classList.remove('hidden');
    btnText.textContent = 'Картки';
    btnIcon.textContent = '🃏';
  } else {
    cardsSec.classList.remove('hidden');
    tableSec.classList.remove('hidden');
    btnText.textContent = 'Таблиця';
    btnIcon.textContent = '📋';
  }
}

// ==========================================================================
// МОДАЛЬНЕ ВІКНО ДОДАВАННЯ / РЕДАГУВАННЯ РАУНДУ
// ==========================================================================

function openAddRoundModal() {
  roundModalState.isEditing = false;
  roundModalState.editingRoundId = null;
  roundModalState.selectedWinnerId = null;
  roundModalState.scores = {};

  appState.players.forEach(p => {
    roundModalState.scores[p.id] = 0;
  });

  document.getElementById('roundModalTitle').innerHTML = `📝 Запис результату <strong>Раунду ${appState.rounds.length + 1}</strong>`;
  setupRoundModalUI();
  openModal('roundModal');
}

function openEditRoundModal(roundId) {
  const round = appState.rounds.find(r => r.id === roundId);
  if (!round) return;

  const roundIndex = appState.rounds.indexOf(round);
  roundModalState.isEditing = true;
  roundModalState.editingRoundId = roundId;
  roundModalState.selectedWinnerId = round.winnerId;
  roundModalState.scores = { ...round.scores };

  document.getElementById('roundModalTitle').innerHTML = `✏️ Редагування <strong>Раунду ${roundIndex + 1}</strong>`;
  setupRoundModalUI();
  openModal('roundModal');
}

function setupRoundModalUI() {
  const winnerContainer = document.getElementById('roundWinnerSelector');
  const inputsContainer = document.getElementById('roundPlayersInputs');
  winnerContainer.innerHTML = '';
  inputsContainer.innerHTML = '';

  const isClassic = appState.mode === 'classic';
  const hint = document.getElementById('roundStepHint');
  if (isClassic) {
    hint.textContent = 'Введіть штрафні карти інших гравців. Бали автоматично підсумуються для переможця!';
  } else {
    hint.textContent = 'Переможець отримує 0. Для решти гравців введіть карти або скористайтесь калькулятором!';
  }

  // Кнопки вибору переможця
  appState.players.forEach(player => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `winner-chip-btn ${roundModalState.selectedWinnerId === player.id ? 'selected' : ''}`;
    btn.innerHTML = `
      <span class="winner-dot" style="background-color: ${player.color}"></span>
      <span>${escapeHtml(player.name)}</span>
    `;

    btn.addEventListener('click', () => {
      selectRoundWinner(player.id);
    });

    winnerContainer.appendChild(btn);
  });

  // Рядки очок
  renderRoundInputs();
  updateRoundModalTotal();
}

function selectRoundWinner(playerId) {
  roundModalState.selectedWinnerId = playerId;

  if (appState.mode === 'penalty') {
    if (roundModalState.scores[playerId] === undefined || roundModalState.scores[playerId] > 0) {
      roundModalState.scores[playerId] = 0;
    }
  }

  // Оновлюємо класи вибраної кнопки
  const buttons = document.querySelectorAll('#roundWinnerSelector .winner-chip-btn');
  appState.players.forEach((p, idx) => {
    if (buttons[idx]) {
      if (p.id === playerId) {
        buttons[idx].classList.add('selected');
      } else {
        buttons[idx].classList.remove('selected');
      }
    }
  });

  renderRoundInputs();
  updateRoundModalTotal();
}

function renderRoundInputs() {
  const container = document.getElementById('roundPlayersInputs');
  container.innerHTML = '';

  const isPenalty = appState.mode === 'penalty';

  appState.players.forEach(player => {
    const isWinner = roundModalState.selectedWinnerId === player.id;
    const row = document.createElement('div');
    row.className = `player-score-input-row ${isWinner ? 'is-winner' : ''}`;

    let controlsHtml = '';
    const currentScore = roundModalState.scores[player.id] !== undefined ? roundModalState.scores[player.id] : 0;
    const prevScore = getPlayerScoreBeforeRound(player.id, roundModalState.isEditing ? roundModalState.editingRoundId : null);
    const toBurn = appState.targetScore - prevScore;
    const isBurnClose = toBurn > 0 && toBurn <= 60;

    if (isWinner && isPenalty) {
      controlsHtml = `
        <div class="winner-score-block">
          <div class="winner-score-primary">
            <span class="winner-tag">🏆 Переможець:</span>
            <div class="winner-input-wrap">
              <input type="number" step="50" inputmode="numeric" class="input-field score-num-input winner-score-input" data-player-id="${player.id}" value="${currentScore}">
              <span class="input-unit">б.</span>
            </div>
          </div>
          
          <div class="black-bonus-section">
            <div class="bonus-title-row">
              <span class="bonus-subheading">🖤 Закінчення чорною картою:</span>
              <span class="bonus-tip">(-50 за кожну чорну карту)</span>
            </div>
            <div class="bonus-chips-group">
              <button type="button" class="btn-bonus-chip ${currentScore === 0 ? 'active' : ''}" data-val="0" title="Звичайне закінчення без бонусу">
                0
              </button>
              <button type="button" class="btn-bonus-chip ${currentScore === -50 ? 'active' : ''}" data-val="-50" title="Закінчення 1 чорною картою (-50)">
                🖤 -50 (1)
              </button>
              <button type="button" class="btn-bonus-chip ${currentScore === -100 ? 'active' : ''}" data-val="-100" title="Закінчення 2 чорними картами (-100)">
                🖤🖤 -100 (2)
              </button>
              <button type="button" class="btn-bonus-chip ${currentScore === -150 ? 'active' : ''}" data-val="-150" title="Закінчення 3 чорними картами (-150)">
                🖤🖤🖤 -150 (3)
              </button>
              <button type="button" class="btn-bonus-step-chip" data-step="-50" title="Додати ще -50">
                ➕ -50
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (isWinner && !isPenalty) {
      // У класичному режимі переможець отримує суму інших
      controlsHtml = `<span class="winner-zero-label" id="classicWinnerSumDisplay">🏆 Переможець (забирає все)</span>`;
    } else {
      controlsHtml = `
        <input type="number" max="999" inputmode="numeric" class="input-field score-num-input" data-player-id="${player.id}" value="${currentScore}">
        <button type="button" class="btn-open-calc" data-player-id="${player.id}" title="Відкрити калькулятор карт">
          <span>🃏 Калькулятор</span>
        </button>
      `;
    }

    row.innerHTML = `
      <div class="row-player-info">
        <span class="player-dot" style="background-color: ${player.color}"></span>
        <div class="player-modal-meta">
          <span class="player-modal-name">${escapeHtml(player.name)}</span>
          <span class="player-burn-calc-hint ${isBurnClose ? 'close-burn' : ''}">
            Поточні: <strong>${prevScore}</strong> б. &nbsp;🔥 До згорання: <strong>${toBurn} б.</strong>
          </span>
        </div>
      </div>
      <div class="row-input-controls">
        ${controlsHtml}
      </div>
    `;

    // Подія зміни інпуту
    const numInput = row.querySelector('.score-num-input');
    if (numInput) {
      numInput.addEventListener('focus', (e) => {
        // Виділяємо весь текст при фокусі — щоб одразу можна було вводити
        e.target.select();
      });

      numInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        roundModalState.scores[player.id] = isNaN(val) ? 0 : val;
        updateRoundModalTotal();

        if (isWinner && isPenalty) {
          row.querySelectorAll('.btn-bonus-chip').forEach(chip => {
            const chipVal = parseInt(chip.dataset.val, 10);
            chip.classList.toggle('active', chipVal === roundModalState.scores[player.id]);
          });
        }
      });
    }

    // Події кнопок бонусу чорної карти
    if (isWinner && isPenalty) {
      row.querySelectorAll('.btn-bonus-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const val = parseInt(chip.dataset.val, 10);
          roundModalState.scores[player.id] = val;
          if (numInput) numInput.value = val;

          row.querySelectorAll('.btn-bonus-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');

          updateRoundModalTotal();
        });
      });

      const stepBtn = row.querySelector('.btn-bonus-step-chip');
      if (stepBtn) {
        stepBtn.addEventListener('click', () => {
          const current = roundModalState.scores[player.id] || 0;
          const nextVal = current - 50;
          roundModalState.scores[player.id] = nextVal;
          if (numInput) numInput.value = nextVal;

          row.querySelectorAll('.btn-bonus-chip').forEach(c => {
            const cVal = parseInt(c.dataset.val, 10);
            c.classList.toggle('active', cVal === nextVal);
          });

          updateRoundModalTotal();
        });
      }
    }

    // Подія відкриття калькулятора
    const calcBtn = row.querySelector('.btn-open-calc');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        openCardCalculator(player.id);
      });
    }

    container.appendChild(row);
  });
}

function updateRoundModalTotal() {
  let losersSum = 0;
  let winnerScore = 0;
  const isClassic = appState.mode === 'classic';

  appState.players.forEach(p => {
    if (p.id !== roundModalState.selectedWinnerId) {
      losersSum += (roundModalState.scores[p.id] || 0);
    } else {
      winnerScore = (roundModalState.scores[p.id] || 0);
    }
  });

  if (isClassic && roundModalState.selectedWinnerId) {
    roundModalState.scores[roundModalState.selectedWinnerId] = losersSum;
    const disp = document.getElementById('classicWinnerSumDisplay');
    if (disp) {
      disp.innerHTML = `🏆 <strong>+${losersSum}</strong> балів`;
    }
    document.getElementById('roundTotalSum').textContent = losersSum;
  } else {
    let summaryText = `${losersSum} балів`;
    if (winnerScore < 0) {
      summaryText += ` (Бонус чорної карти: ${winnerScore} б.)`;
    }
    document.getElementById('roundTotalSum').textContent = summaryText;
  }
}

function saveRoundFromModal() {
  if (!roundModalState.selectedWinnerId) {
    showToast('Виберіть, хто скинув карти (Переможець раунду)!');
    return;
  }

  const statsBefore = getPlayerStats();

  // Зчитуємо поточні значення з усіх інпутів на випадок якщо юзер не викликав blur
  document.querySelectorAll('#roundPlayersInputs .score-num-input').forEach(input => {
    const pId = input.dataset.playerId;
    const val = parseInt(input.value, 10);
    roundModalState.scores[pId] = isNaN(val) ? 0 : val;
  });

  updateRoundModalTotal();

  if (roundModalState.isEditing) {
    const round = appState.rounds.find(r => r.id === roundModalState.editingRoundId);
    if (round) {
      round.winnerId = roundModalState.selectedWinnerId;
      round.scores = { ...roundModalState.scores };
    }
  } else {
    const newRound = {
      id: 'r_' + Date.now(),
      roundNum: appState.rounds.length + 1,
      winnerId: roundModalState.selectedWinnerId,
      scores: { ...roundModalState.scores },
      timestamp: Date.now()
    };
    appState.rounds.push(newRound);
  }

  // Перевірка чи згоріли в когось очки після цього раунду
  const statsAfter = getPlayerStats();
  const burnedPlayers = [];
  appState.players.forEach(p => {
    if ((statsAfter.burnsCount[p.id] || 0) > (statsBefore.burnsCount[p.id] || 0)) {
      burnedPlayers.push(p.name);
    }
  });

  closeModal('roundModal');

  if (burnedPlayers.length > 0) {
    // Show dramatic burn announcement modal (queued if multiple players burned)
    showBurnAnnouncementQueue(burnedPlayers, appState.targetScore);
  } else {
    showToast(roundModalState.isEditing ? 'Раунд оновлено!' : `Раунд ${appState.rounds.length} успішно записано!`);
  }
  saveGameState();
  renderGameUI();
}

function undoLastRound() {
  if (appState.rounds.length === 0) return;
  const last = appState.rounds.pop();
  saveGameState();
  renderGameUI();
  showToast(`Останній раунд (${last.roundNum}) скасовано`);
}

function deleteRound(roundId) {
  if (confirm('Видалити цей раунд з таблиці?')) {
    appState.rounds = appState.rounds.filter(r => r.id !== roundId);
    saveGameState();
    renderGameUI();
    showToast('Раунд видалено');
  }
}

// ==========================================================================
// КАЛЬКУЛЯТОР КАРТ UNO
// ==========================================================================

function openCardCalculator(playerId) {
  const player = appState.players.find(p => p.id === playerId);
  if (!player) return;

  calcState.playerId = playerId;
  calcState.cards = [];
  calcState.total = 0;

  document.getElementById('calcPlayerName').textContent = player.name;
  updateCalcUI();
  openModal('calcModal');
}

function addCardToCalc(val, label) {
  calcState.cards.push({ val, label });
  calcState.total += val;
  updateCalcUI();
}

function undoCalcCard() {
  if (calcState.cards.length === 0) return;
  const popped = calcState.cards.pop();
  calcState.total = Math.max(0, calcState.total - popped.val);
  updateCalcUI();
}

function clearCalc() {
  calcState.cards = [];
  calcState.total = 0;
  updateCalcUI();
}

function updateCalcUI() {
  const formulaEl = document.getElementById('calcFormula');
  const sumEl = document.getElementById('calcTotalSum');
  const btnSumEl = document.getElementById('calcBtnSum');

  if (calcState.cards.length === 0) {
    formulaEl.textContent = 'Виберіть карти, що залишились у руці:';
  } else {
    formulaEl.textContent = calcState.cards.map(c => c.label).join(' + ') + ` = ${calcState.total}`;
  }

  sumEl.textContent = calcState.total;
  btnSumEl.textContent = calcState.total;
}

function applyCalcResult() {
  if (!calcState.playerId) return;

  roundModalState.scores[calcState.playerId] = calcState.total;

  // Оновлюємо інпут у модалці раунду
  const input = document.querySelector(`#roundPlayersInputs .score-num-input[data-player-id="${calcState.playerId}"]`);
  if (input) {
    input.value = calcState.total;
  }

  updateRoundModalTotal();
  closeModal('calcModal');
  showToast(`Застосовано ${calcState.total} балів`);
}

// ==========================================================================
// ПЕРЕВІРКА ПЕРЕМОГИ ТА КОНФЕТІ
// ==========================================================================

let pendingOverLimitPlayers = [];
let pendingRanked = [];

function checkGameEndCondition(ranked) {
  if (appState.rounds.length === 0) return;
  if (appState.status === 'gameover') return;

  if (appState.mode === 'penalty') {
    // Якщо хтось набрав БІЛЬШЕ ніж ліміт (наприклад, 501+ при ліміті 500)
    // (якщо рівно 500, то бали вже згоріли до 0 в getPlayerStats)
    const overLimitPlayers = ranked.filter(p => p.total > appState.targetScore);
    if (overLimitPlayers.length > 0) {
      promptLimitExceeded(overLimitPlayers, ranked);
    }
  } else {
    // Класичний режим: перший, хто набрав targetScore
    const reachedTarget = ranked.find(p => p.total >= appState.targetScore);
    if (reachedTarget) {
      triggerGameOver(reachedTarget, ranked);
    }
  }
}

function promptLimitExceeded(overLimitPlayers, ranked) {
  pendingOverLimitPlayers = overLimitPlayers;
  pendingRanked = ranked;

  const names = overLimitPlayers.map(p => `<strong>${escapeHtml(p.name)}</strong> (${p.total} б.)`).join(', ');
  document.getElementById('exceededPlayerMessage').innerHTML =
    `Гравець ${names} перевищив(ла) ліміт гри!`;
  document.getElementById('exceededCurrentLimit').textContent = appState.targetScore;
  document.getElementById('newTargetScorePreview').textContent = appState.targetScore + 200;

  openModal('limitExceededModal');
}

function triggerGameOver(winner, ranked) {
  appState.status = 'gameover';
  appState.winnerId = winner.id;
  saveGameState();

  // Запуск конфеті
  startConfetti();

  // Заповнення модалки
  document.getElementById('winnerName').textContent = winner.name;

  if (appState.mode === 'penalty') {
    document.getElementById('winnerScoreDetails').textContent =
      `З результатом усього ${winner.total} балів за ${appState.rounds.length} раундів!`;
  } else {
    document.getElementById('winnerScoreDetails').textContent =
      `Першим подолав позначку в ${appState.targetScore} балів, набравши ${winner.total}!`;
  }

  const list = document.getElementById('finalStandingsList');
  list.innerHTML = '';
  ranked.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'final-item-row';
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    row.innerHTML = `
      <div class="final-item-player">
        <span>${medal}</span>
        <span class="player-dot" style="background-color: ${p.color}"></span>
        <span>${escapeHtml(p.name)}</span>
      </div>
      <div class="final-item-score">
        ${p.total} б. (${p.wins} перемог)
      </div>
    `;
    list.appendChild(row);
  });

  openModal('gameOverModal');
}

// Легкий генератор конфеті на HTML5 Canvas
let confettiAnimationId = null;

function startConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  const confettiCount = 80;
  const confetti = [];
  const colors = ['#e53935', '#1976d2', '#2e7d32', '#fbc02d', '#8e24aa', '#ff5722'];

  for (let i = 0; i < confettiCount; i++) {
    confetti.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * confettiCount,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.floor(Math.random() * 10) - 10,
      tiltAngleInc: Math.random() * 0.07 + 0.05,
      tiltAngle: 0
    });
  }

  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);

  let step = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    step++;

    confetti.forEach((p, i) => {
      p.tiltAngle += p.tiltAngleInc;
      p.y += (Math.cos(step + p.d) + 2 + p.r / 3);
      p.x += Math.sin(step);
      p.tilt = Math.sin(p.tiltAngle) * 12;

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();

      if (p.y > canvas.height) {
        confetti[i] = {
          x: Math.random() * canvas.width,
          y: -10,
          r: p.r,
          d: p.d,
          color: p.color,
          tilt: p.tilt,
          tiltAngleInc: p.tiltAngleInc,
          tiltAngle: p.tiltAngle
        };
      }
    });

    confettiAnimationId = requestAnimationFrame(draw);
  }

  draw();

  // Зупинити конфеті через 8 секунд
  setTimeout(() => {
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, 8000);
}

// ==========================================================================
// ЕКСПОРТ ТА ЗБЕРЕЖЕННЯ
// ==========================================================================

function generateShareText() {
  const { ranked } = getPlayerStats();
  const isPenalty = appState.mode === 'penalty';
  const winner = ranked[0];

  let text = `🎮 UNO: Результати гри!\n`;
  if (winner) {
    text += `🏆 Переможець: ${winner.name} (${winner.total} б.)\n\n`;
  }
  text += `📊 Підсумкова таблиця:\n`;

  ranked.forEach((p, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    text += `${medal} ${p.name} — ${p.total} б. (${p.wins} роздач)\n`;
  });

  text += `\n🎯 Зіграно раундів: ${appState.rounds.length}\n`;
  text += `⚙️ Режим: ${isPenalty ? 'Штрафні бали (Пенальті)' : 'Класичний'} (ліміт: ${appState.targetScore})\n`;
  text += `⏱️ Дата: ${new Date().toLocaleDateString('uk-UA')}`;

  return text;
}

function prepareShareModal() {
  const text = generateShareText();
  document.getElementById('shareTextarea').value = text;
}

function copyShareTextToClipboard() {
  const text = generateShareText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Результат скопійовано в буфер! Можна вставляти в чат.');
  }).catch(() => {
    showToast('Не вдалося скопіювати автоматично, виділіть текст вручну.');
  });
}

function downloadCSV() {
  if (appState.players.length === 0) return;

  const { totals } = getPlayerStats();
  let csv = '\uFEFF'; // UTF-8 BOM для коректного відкриття в українському Excel

  // Заголовок таблиці
  csv += 'Раунд;' + appState.players.map(p => `"${p.name.replace(/"/g, '""')}"`).join(';') + '\r\n';

  // Рядки раундів
  appState.rounds.forEach((round, idx) => {
    const scores = appState.players.map(p => {
      const isWin = round.winnerId === p.id;
      const score = round.scores[p.id] !== undefined ? round.scores[p.id] : 0;
      return isWin ? `${score} (WIN)` : score;
    });
    csv += `Раунд ${idx + 1};` + scores.join(';') + '\r\n';
  });

  // Підсумок
  csv += 'ВСЬОГО;' + appState.players.map(p => totals[p.id] || 0).join(';') + '\r\n';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `uno_game_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📊 CSV файл успішно завантажено!');
}

function archiveCurrentGame() {
  if (appState.rounds.length === 0) return;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_GAMES) || '[]');
    const { ranked } = getPlayerStats();
    const gameRecord = {
      id: 'game_' + Date.now(),
      date: new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      mode: appState.mode,
      targetScore: appState.targetScore,
      roundsCount: appState.rounds.length,
      winner: ranked[0] ? { name: ranked[0].name, total: ranked[0].total } : null,
      standings: ranked.map(p => ({ name: p.name, total: p.total, wins: p.wins }))
    };

    saved.unshift(gameRecord);
    if (saved.length > 20) saved.pop();
    localStorage.setItem(STORAGE_KEYS.SAVED_GAMES, JSON.stringify(saved));
  } catch (e) {
    console.error(e);
  }
}

function renderHistoryModal() {
  const container = document.getElementById('historyGamesList');
  const emptyMsg = document.getElementById('emptyHistoryMessage');
  const clearBtn = document.getElementById('btnClearHistory');

  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_GAMES) || '[]');
  } catch (e) { }

  if (saved.length === 0) {
    emptyMsg.classList.remove('hidden');
    container.innerHTML = '';
    clearBtn.classList.add('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  clearBtn.classList.remove('hidden');
  container.innerHTML = '';

  saved.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const winnerName = item.winner ? item.winner.name : 'Не визначено';
    const winnerTotal = item.winner ? item.winner.total : 0;
    const modeName = item.mode === 'penalty' ? 'Штрафні' : 'Класичні';

    div.innerHTML = `
      <div class="history-item-left">
        <div class="history-winner-title">🏆 ${escapeHtml(winnerName)} (${winnerTotal} б.)</div>
        <div class="history-meta-text">
          ${item.date} • ${item.roundsCount} раундів • ${modeName} (до ${item.targetScore})
        </div>
      </div>
      <div class="history-meta-text">
        ${item.standings.map(s => `${escapeHtml(s.name)}: ${s.total}`).join(' | ')}
      </div>
    `;
    container.appendChild(div);
  });
}

// ==========================================================================
// LOCAL STORAGE & УТИЛІТИ
// ==========================================================================

function saveGameState() {
  try {
    if (typeof roundModalState !== 'undefined') {
      appState.roundModalState = roundModalState;
    }
    localStorage.setItem(STORAGE_KEYS.CURRENT_GAME, JSON.stringify(appState));
  } catch (e) {
    console.error('Помилка збереження:', e);
  }
}

function saveCurrentScreenScroll() {
  if (!appState.currentScreen) return;
  appState.screenScrollPositions = appState.screenScrollPositions || {};
  appState.screenScrollPositions[appState.currentScreen] = window.scrollY;
  appState.screenScrollY = window.scrollY;
  saveGameState();
}

function loadSavedGameState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_GAME);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.players && parsed.players.length > 0) {
        appState = parsed;
        appState.screenScrollPositions = appState.screenScrollPositions || {};
        appState.screenScrollY = appState.screenScrollY || 0;
        if (appState.roundModalState) {
          roundModalState = appState.roundModalState;
        }
        appState.currentScreen = appState.currentScreen || (
          appState.status === 'playing' || appState.status === 'gameover'
            ? 'gameScreen'
            : 'setupScreen'
        );
        if (appState.status === 'playing' || appState.status === 'gameover') {
          showScreen(appState.currentScreen === 'setupScreen' ? 'setupScreen' : 'gameScreen');
          renderGameUI();
          if (appState.currentModal) {
            if (appState.currentModal === 'roundModal' && roundModalState) {
              setupRoundModalUI();
            }
            requestAnimationFrame(() => openModal(appState.currentModal));
          }
          return;
        }
      }
    }
  } catch (e) {
    console.error('Помилка завантаження гри:', e);
  }

  // За замовчуванням показуємо Setup
  showScreen('setupScreen');
  renderPlayersList();
  updateStartGameButton();
  updateColorPickerUI();
  if (appState.currentModal) {
    requestAnimationFrame(() => openModal(appState.currentModal));
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    appState.currentModal = modalId;
    saveGameState();
    updateModalViewport();
    if (!document.body.classList.contains('modal-open')) {
      modalScrollPosition = {
        x: window.scrollX,
        y: window.scrollY
      };
      document.body.classList.add('modal-open');
      document.body.style.top = `-${modalScrollPosition.y}px`;
    }
    modal.classList.add('open');
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.scrollTop = 0;
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    if (appState.currentModal === modalId) {
      appState.currentModal = null;
      saveGameState();
    }
    if (!document.querySelector('.modal-backdrop.open')) {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      if (modalScrollPosition) {
        window.scrollTo(modalScrollPosition.x, modalScrollPosition.y);
        modalScrollPosition = null;
      }
    }
  }
}

function updateModalViewport() {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const top = viewport ? viewport.offsetTop : 0;
  document.documentElement.style.setProperty('--modal-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top', `${top}px`);
}

// ==========================================================================
// BURN ANNOUNCEMENT MODAL (dramatic full-screen overlay)
// ==========================================================================

let burnQueue = [];
let burnShowing = false;

function showBurnAnnouncementQueue(playerNames, limitScore) {
  // Queue up each burned player
  playerNames.forEach(name => burnQueue.push({ name, limitScore }));
  if (!burnShowing) showNextBurn();
}

function showNextBurn() {
  if (burnQueue.length === 0) {
    burnShowing = false;
    return;
  }
  burnShowing = true;
  const { name, limitScore } = burnQueue.shift();

  const modal = document.getElementById('burnModal');
  if (!modal) return;

  document.getElementById('burnPlayerName').textContent = name;
  document.getElementById('burnLimitDisplay').textContent = limitScore;
  document.getElementById('burnScoreBefore').textContent = limitScore;

  // Reset animation by cloning (force re-trigger)
  const dialog = modal.querySelector('.modal-burn');
  if (dialog) {
    dialog.style.animation = 'none';
    // Force reflow
    void dialog.offsetWidth;
    dialog.style.animation = '';
  }

  openModal('burnModal');
}



let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return m;
    }
  });
}
