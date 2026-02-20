# Журнал Журналів – Web Version

## Архітектура
- Frontend: React + TypeScript
- Game Engine: boardgame.io
- Backend: Node.js
- Формат карт: JSON
- Зображення: PNG/WebP (public/cards)

## Ресурси гравця
- time (🕓)
- reputation (⭐)
- discipline (⚖️)
- documents (📂)
- tech (💻)

## Категорії карт
- LYAP
- SCANDAL
- SUPPORT
- DECISION
- NEUTRAL
- VVNZ
- LEGENDARY

## Основні правила
- 5 стартових карт
- 5 легендарних окремо
- Ліміт руки 8
- Хід: Draw → Play → Optional Pass
- Звання з вимогами і cost
- Перемога: Генерал або кінець колоди

## Структура гри
- cards.ts
- ranks.ts
- jojGame.ts
- UI React components