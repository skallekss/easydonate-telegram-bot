# EasyDonate Telegram Bot

Бот для автоматизации уведомлений о новых платежах и ежедневных отчетов по API EasyDonate в Telegram.

## Возможности
- Проверяет новые платежи через API EasyDonate
- Сохраняет информацию о платежах в SQLite
- Отправляет уведомления в Telegram выбранным пользователям
- Формирует и отправляет ежедневные отчеты о покупках

## Быстрый старт

1. **Установите зависимости:**
   ```sh
   npm install node-fetch sqlite3 node-telegram-bot-api luxon
   ```
2. **Заполните переменные в начале `bot.mjs`:**
   ```js
   const TELEGRAM_BOT_TOKEN = "ВАШ_ТОКЕН_ТЕЛЕГРАМ_БОТА";
   const AUTHORIZED_TG_USER_IDS = [ВАШ_ID_1, ВАШ_ID_2];
   const SHOP_KEY = "ВАШ_SHOP_KEY";
   ```
3. **Запустите бота:**
   ```sh
   node bot.mjs
   ```

## Переменные
- `TELEGRAM_BOT_TOKEN` — токен вашего Telegram-бота
- `AUTHORIZED_TG_USER_IDS` — массив Telegram user_id, которым будут приходить уведомления
- `SHOP_KEY` — ключ магазина EasyDonate

## Официальная документация EasyDonate API
- [Документация EasyDonate API](https://easydonate.ru/developers/api)
- [Метод получения последних платежей](https://easydonate.ru/developers/api/plugin/last-payments)

## Структура таблицы payments
- `id` — ID платежа
- `created_at` — дата и время платежа
- `customer` — ник покупателя
- `products` — список товаров
- `amount` — сумма
- `command_response` — лог выполнения команд

## Лицензия
MIT
