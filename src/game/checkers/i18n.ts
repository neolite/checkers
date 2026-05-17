export type Locale = 'ru' | 'en';

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALES: Locale[] = ['ru', 'en'];

export function localeLabel(locale: Locale): string {
  return locale === 'ru' ? 'Русский' : 'English';
}

type Dict = Record<string, { ru: string; en: string }>;

const DICT: Dict = {
  'header.title': { ru: 'Премиум-шашки', en: 'Premium Checkers' },
  'header.subtitle': { ru: 'AI-тренер · обязательные взятия · летающие дамки', en: 'AI Coach · forced captures · flying kings' },
  'header.menu': { ru: 'Меню', en: 'Menu' },

  'turn.white-to-move': { ru: 'Ход белых', en: 'White to move' },
  'turn.black-to-move': { ru: 'Ход чёрных', en: 'Black to move' },
  'turn.black-thinking': { ru: 'Чёрные думают…', en: 'Black thinking…' },
  'turn.draw': { ru: 'Ничья', en: 'Draw' },
  'turn.wins': { ru: 'Победа · {side}', en: '{side} wins' },
  'turn.forced-capture': { ru: 'Обязательное взятие', en: 'Forced capture' },

  'persona.yara.handle': { ru: 'Яра Бишоп', en: 'Yara Bishop' },
  'persona.yara.tagline': { ru: 'Тактический спарринг', en: 'Tactical training partner' },
  'persona.yara.first': { ru: 'Яра', en: 'Yara' },
  'persona.dana.handle': { ru: 'Дана Эндгейм', en: 'Dana Endgame' },
  'persona.dana.tagline': { ru: 'Позиционная игра', en: 'Solid positional play' },
  'persona.dana.first': { ru: 'Дана', en: 'Dana' },
  'persona.magnus.handle': { ru: 'Магнус 8', en: 'Magnus 8' },
  'persona.magnus.tagline': { ru: 'Наказывает любые ошибки', en: 'Punishes every mistake' },
  'persona.magnus.first': { ru: 'Магнус', en: 'Magnus' },
  'persona.hotseat.handle': { ru: 'Локальный хотсит', en: 'Local Hotseat' },
  'persona.hotseat.tagline': { ru: 'Два игрока на одном экране', en: 'Two players, one screen' },

  'coach.status.live': { ru: 'AI-тренер', en: 'Live coach' },
  'coach.status.thinking': { ru: '{name} думает', en: '{name} thinking' },
  'coach.status.move': { ru: 'Ход {n}', en: 'Move {n}' },
  'coach.status.complete': { ru: 'Партия завершена', en: 'Match complete' },
  'coach.tip.label': { ru: 'Подсказка', en: 'Live tip' },
  'coach.lookfor.label': { ru: 'Обрати внимание', en: 'Look for' },
  'coach.eval.label': { ru: 'Материал', en: 'Material balance' },
  'coach.eval.even': { ru: 'Равенство', en: 'Even' },
  'coach.eval.white': { ru: 'Белые +{n}', en: 'White +{n}' },
  'coach.eval.black': { ru: 'Чёрные +{n}', en: 'Black +{n}' },
  'coach.review-cta': { ru: 'Открыть разбор тренера', en: 'Open Coach Review' },
  'coach.idle': { ru: 'Начни партию — тренер подскажет тактику и разберёт ошибки.', en: 'Start a match to get live tactical guidance and a post-game review of every move.' },

  'tip.forced-jump': { ru: 'Обязательное взятие: {move} забирает {n}.', en: 'Forced jump: {move} wins {n}.' },
  'tip.king-row': { ru: 'Кандидат: {move} доходит до дамочного ряда.', en: 'Candidate: {move} reaches king row.' },
  'tip.center-control': { ru: 'Кандидат: {move} усиливает центр.', en: 'Candidate: {move} improves center control.' },
  'tip.tempo': { ru: 'Кандидат: {move} держит темп без подставы.', en: 'Candidate: {move} keeps tempo without exposing a capture.' },
  'tip.no-legal': { ru: 'Нет ходов. Позиция определена.', en: 'No legal move. The position is decided.' },

  'lookfor.forced': { ru: 'Проверь, нет ли цепочки длиннее.', en: 'Confirm no other capture chain is longer.' },
  'lookfor.king-row': { ru: 'Спланируй кратчайший путь к дамочному ряду.', en: 'Map your shortest path to the king row.' },
  'lookfor.center': { ru: 'Следи за четырьмя центральными диагоналями.', en: 'Watch the four central diagonals.' },
  'lookfor.tempo': { ru: 'Просканируй все диагонали — нет ли форсажа.', en: 'Scan each diagonal for a forcing reply.' },
  'lookfor.decided': { ru: 'Партия закончена — изучи разбор.', en: 'Match is decided — review your tactical map.' },
  'lookfor.default': { ru: 'Перед ходом сканируй все четыре диагонали.', en: 'Scan the four diagonals before you move.' },

  'help.first-move': { ru: 'Клик по фигуре, потом по подсвеченной клетке. Оранжевый — обязательное взятие.', en: 'Click a piece, then a highlighted square. Orange means capture is forced.' },
  'capture.label.white': { ru: 'Взято · Б', en: 'Captured W' },
  'capture.label.black': { ru: 'Взято · Ч', en: 'Captured B' },

  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.skin': { ru: 'Скин: {name}', en: 'Skin: {name}' },
  'settings.pro.active': { ru: 'Pro активен', en: 'Pro Active' },
  'settings.pro.upgrade': { ru: 'Подключить Pro', en: 'Upgrade to Pro' },
  'settings.undo': { ru: 'Отмена хода', en: 'Undo' },
  'settings.restart': { ru: 'Перезапуск', en: 'Restart' },
  'settings.surrender': { ru: 'Сдаться', en: 'Surrender' },
  'settings.language': { ru: 'Язык: Русский', en: 'Language: English' },

  'opponent.title': { ru: 'Выбери соперника', en: 'Choose opponent' },
  'opponent.hotseat-on': { ru: 'Переключить на AI', en: 'Switch to AI' },
  'opponent.hotseat-off': { ru: 'Локальный хотсит', en: 'Switch to Local Hotseat' },

  'skin.classic': { ru: 'Классика', en: 'Classic' },
  'skin.obsidian': { ru: 'Обсидиан', en: 'Obsidian' },
  'skin.aurora': { ru: 'Аврора', en: 'Aurora' },

  'confirm.surrender.title': { ru: 'Сдаться?', en: 'Surrender?' },
  'confirm.surrender.body': { ru: 'Сдача засчитывается как поражение.', en: 'Surrender counts as a loss in this match.' },
  'confirm.cancel': { ru: 'Отмена', en: 'Cancel' },
  'confirm.surrender.yes': { ru: 'Да, сдаюсь', en: 'Yes, surrender' },

  'gameover.review': { ru: 'Открыть разбор', en: 'Open Coach Review' },
  'gameover.restart': { ru: 'Новая партия', en: 'New Match' },
  'gameover.match-complete': { ru: 'Партия окончена', en: 'Match complete' },

  'result.resign': { ru: 'Сдача', en: 'Resignation' },
  'result.pat': { ru: 'Пат — нет ходов', en: 'Pat: no legal moves' },
  'result.king-majority': { ru: 'Решено по дамкам', en: 'Endgame adjudication' },
  'result.draw-repetition': { ru: 'Ничья: повтор позиции', en: 'Draw: repeated position' },
  'result.draw-no-progress': { ru: 'Ничья: нет прогресса', en: 'Draw: no progress' },
  'result.no-pieces': { ru: 'Нет фигур', en: 'No pieces left' },

  'result.suffix.resign': { ru: ' сдачей', en: ' by resignation' },
  'result.suffix.pat': { ru: ' патом', en: ' by pat' },
  'result.suffix.king-majority': { ru: ' по дамочному большинству', en: ' by king majority' },
  'result.suffix.no-pieces': { ru: ' разгромом', en: ' by capture' },

  'side.white': { ru: 'Белые', en: 'White' },
  'side.black': { ru: 'Чёрные', en: 'Black' },

  'win.resign': { ru: '{side} сдались.', en: '{side} resigned.' },
  'win.pat': { ru: 'У {side} нет ходов. Пат — поражение.', en: '{side} has no legal moves. Pat counts as a loss.' },
  'win.king-majority': { ru: 'У {side} чистое большинство по дамкам в эндшпиле без взятий.', en: '{side} has a clean king majority in a no-capture endgame.' },
  'win.no-pieces': { ru: 'У соперника не осталось фигур.', en: 'Opponent has no pieces left.' },

  'draw.repetition': { ru: 'Одна и та же позиция повторилась трижды.', en: 'Same position appeared three times.' },
  'draw.no-progress': { ru: 'За 80 полу-ходов не было ни взятий, ни превращений.', en: 'No capture or promotion happened for 80 plies.' },
  'draw.generic': { ru: 'Партия завершена.', en: 'Match complete.' },

  'history.title': { ru: 'История ходов', en: 'Move History' },
  'history.empty': { ru: 'Ходов пока нет.', en: 'No moves yet.' },

  'start.title': { ru: 'Премиум-шашки', en: 'Premium Checkers' },
  'start.sub': { ru: 'Русские шашки 8×8: обязательные взятия, летающие дамки, кинематографичная камера и живой AI-тренер, который разбирает каждое решение.', en: 'Russian 8x8 rules with mandatory captures, flying kings, cinematic camera and a live AI Coach that reviews your tactical decisions.' },
  'start.handle': { ru: 'Никнейм', en: 'Handle' },
  'start.city': { ru: 'Город', en: 'City' },
  'start.game-type': { ru: 'Формат', en: 'Game Type' },
  'start.opponent': { ru: 'Соперник', en: 'Opponent' },
  'start.player-vs-ai': { ru: 'Игрок vs AI', en: 'Player vs AI' },
  'start.hotseat': { ru: 'Хотсит', en: 'Hotseat' },
  'start.cta': { ru: 'Начать партию', en: 'Start Match' },
  'start.guest': { ru: 'Гость-стратег', en: 'Guest Strategist' },
  'start.default-city': { ru: 'Алматы', en: 'Almaty' },

  'results.title': { ru: 'Сводка', en: 'Results Table' },
  'results.ai-wins': { ru: 'Побед над AI', en: 'AI wins' },
  'results.ai-losses': { ru: 'Поражений от AI', en: 'AI losses' },
  'results.draws': { ru: 'Ничьих', en: 'Draws' },
  'results.hotseat': { ru: 'Хотсит-партий', en: 'Hotseat games' },
  'results.no-matches': { ru: 'Партий ещё не было', en: 'No matches yet' },
  'results.top-city': { ru: 'Топ · {city}', en: 'Top {city}' },
  'results.last-win': { ru: '{side} победили{suffix} за {n} ходов', en: '{side} won{suffix} in {n} moves' },
  'results.last-draw': { ru: '{reason} за {n} ходов', en: '{reason} in {n} moves' },

  'leader.streak.form': { ru: 'форма', en: '+form' },
  'leader.streak.training': { ru: 'тренируется', en: 'training' },
  'leader.streak.coach': { ru: 'тренер', en: 'coach' },
  'leader.streak.win-template': { ru: '{n}W', en: '{n}W' },

  'guide.drop-on-highlight': { ru: 'Брось на подсвеченную клетку.', en: 'Drop on a highlighted square to move.' },
  'guide.forced': { ru: 'Обязательное взятие: должна ходить другая фигура.', en: 'Forced capture: another piece must jump.' },
  'guide.no-legal': { ru: 'У этой фигуры нет ходов.', en: 'This piece has no legal move.' },
  'guide.pro-unlocked': { ru: 'Pro-скин разблокирован в этом прототипе.', en: 'Pro board skin unlocked in this prototype.' },
  'guide.link-copied': { ru: 'Ссылка-приглашение скопирована.', en: 'Challenge link copied.' },
  'guide.link-ready': { ru: 'Ссылка-приглашение в адресной строке.', en: 'Challenge link is ready in the address bar.' },
  'guide.link-loaded': { ru: 'Партия по ссылке загружена.', en: 'Challenge link loaded.' },

  'report.headline.masterclass': { ru: 'Мастер-класс', en: 'Masterclass' },
  'report.headline.strong': { ru: 'Сильная тактика', en: 'Strong tactical game' },
  'report.headline.playable': { ru: 'Играбельно, есть над чем работать', en: 'Playable, with training targets' },
  'report.headline.risky': { ru: 'Партия с риском', en: 'High-risk game' },
  'report.summary': { ru: '{cap} взятий, {prom} превращений, {miss} упущенных комбинаций.', en: '{cap} captures, {prom} promotions, {miss} missed combo windows.' },

  'report.insight.bigger-combo.title': { ru: 'Ход {n}: была комбинация длиннее', en: 'Move {n}: bigger combo was available' },
  'report.insight.bigger-combo.body-known': { ru: '{played} забрал {takenN}; {best} мог забрать {bestN}.', en: '{played} took {takenN}; {best} could take {bestN}.' },
  'report.insight.bigger-combo.body-unknown': { ru: '{played} оставил более сильную цепочку взятий.', en: '{played} left a stronger capture sequence on the board.' },
  'report.insight.forcing-reply.title': { ru: 'Ход {n}: соперник получил форсаж', en: 'Move {n}: opponent got a forcing reply' },
  'report.insight.forcing-reply.body': { ru: '{played} разрешил {reply}. Ищи ходы, не открывающие диагональ.', en: '{played} allowed {reply}. Look for moves that keep the diagonal closed.' },

  'report.fallback.good.title': { ru: 'Чистый тактический профиль', en: 'Clean tactical profile' },
  'report.fallback.good.body-with-cap': { ru: 'Ты конвертировал {n} взятий, не оставив форсирующих ответов.', en: 'You converted {n} captures without leaving obvious forced replies.' },
  'report.fallback.good.body-no-cap': { ru: 'Тактических ошибок не видно. Раньше создавай угрозы взятия.', en: 'No major tactical leaks detected. Try creating forcing capture threats earlier.' },
  'report.fallback.promotions.title': { ru: 'Давление на дамочный ряд сработало', en: 'Promotion pressure worked' },
  'report.fallback.promotions.body': { ru: 'Ты дошёл до дамочного ряда {n} раз. Строй больше планов на эту линию.', en: 'You reached king row {n} times. Build more plans around that lane.' },
  'report.fallback.training.title': { ru: 'Следующая цель тренировки', en: 'Next training focus' },
  'report.fallback.training.body': { ru: 'Перед каждым тихим ходом сканируй все четыре диагонали на форсаж.', en: 'Before every quiet move, scan the four diagonals for a forcing reply.' },

  'review.eyebrow': { ru: 'Разбор AI-тренера', en: 'AI Coach Review' },
  'review.score-label': { ru: 'Балл', en: 'Score' },
  'review.replay': { ru: 'Сыграть ещё', en: 'Play again' },
  'review.back': { ru: 'Назад в партию', en: 'Back to match' },
  'review.menu': { ru: 'Главное меню', en: 'Main menu' },
  'review.pro-upsell': { ru: 'Хочешь пошаговый разбор? <b>Подключи Pro</b>', en: 'Want per-move deep analysis? <b>Upgrade to Pro</b>' },
  'review.pro-upgrade': { ru: 'Подключить', en: 'Upgrade' },

  'onboard.step-of': { ru: 'Шаг {n} из {total}', en: 'Step {n} of {total}' },
  'onboard.welcome.eyebrow': { ru: 'Знакомство', en: 'Welcome' },
  'onboard.welcome.title': { ru: 'Премиум-шашки с AI-тренером', en: 'Premium Checkers with an AI Coach' },
  'onboard.welcome.body': { ru: 'Прежде чем сесть за доску, познакомимся за минуту. Тренер будет подсказывать тактику и разберёт каждую партию по ходам.', en: 'Before we set up the board, a quick intro. The coach will guide your tactics live and break down every move after the game.' },
  'onboard.welcome.feat1.t': { ru: 'AI-тренер', en: 'AI Coach' },
  'onboard.welcome.feat1.b': { ru: 'Живые подсказки во время партии.', en: 'Live tips while you play.' },
  'onboard.welcome.feat2.t': { ru: 'Полный разбор', en: 'Full review' },
  'onboard.welcome.feat2.b': { ru: 'Балл 0–100 и анализ ошибок после партии.', en: '0–100 score and per-move analysis after the match.' },
  'onboard.welcome.feat3.t': { ru: 'Городской топ', en: 'City leaderboard' },
  'onboard.welcome.feat3.b': { ru: 'Сравни рейтинг с игроками своего города.', en: 'Compare ratings with players from your city.' },
  'onboard.welcome.cta': { ru: 'Поехали', en: "Let's go" },

  'onboard.profile.eyebrow': { ru: 'Профиль', en: 'Profile' },
  'onboard.profile.title': { ru: 'Как тебя называть?', en: 'What should we call you?' },
  'onboard.profile.body': { ru: 'Имя и город нужны, чтобы попасть в локальный лидерборд. Можно поменять позже в настройках.', en: 'Handle and city power the local leaderboard. You can change them later in settings.' },
  'onboard.profile.lang': { ru: 'Язык интерфейса', en: 'Interface language' },
  'onboard.next': { ru: 'Дальше', en: 'Continue' },
  'onboard.back': { ru: 'Назад', en: 'Back' },

  'onboard.opponent.eyebrow': { ru: 'Соперник', en: 'Opponent' },
  'onboard.opponent.title': { ru: 'С кем сыграешь?', en: 'Who do you want to play?' },
  'onboard.opponent.body': { ru: 'Соперника можно сменить в любой момент — иконка слева на правом баре. Хочешь сыграть с другом за одним экраном? Выбери Хотсит.', en: 'Switch opponents anytime via the right-side rail. Want to play a friend on the same screen? Pick Hotseat.' },
  'onboard.opponent.cta': { ru: 'Начать первую партию', en: 'Play your first match' },

  'welcome-back.eyebrow': { ru: 'С возвращением', en: 'Welcome back' },
  'welcome-back.title': { ru: 'Привет, {name}', en: 'Hi, {name}' },
  'welcome-back.body': { ru: 'Готов к следующей партии? Соперника, формат и тему можно менять прямо во время матча.', en: 'Ready for another match? You can change the opponent, format and theme during the match.' },
  'welcome-back.edit': { ru: 'Изменить профиль', en: 'Edit profile' },

  'icon.opponent.title': { ru: 'Выбрать соперника', en: 'Choose opponent' },
  'icon.theme.title': { ru: 'Сменить тему', en: 'Switch theme' },
  'icon.settings.title': { ru: 'Настройки матча', en: 'Match settings' },
  'icon.pro.title': { ru: 'Pro-скин', en: 'Pro skin' },
  'icon.invite.title': { ru: 'Пригласить', en: 'Invite link' },
};

export function t(locale: Locale, key: keyof typeof DICT | string, vars?: Record<string, string | number>): string {
  const entry = (DICT as Dict)[key];
  if (!entry) return key;
  let s = entry[locale] ?? entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
