import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import TelegramBot from 'node-telegram-bot-api';
import { DateTime } from 'luxon';

const TELEGRAM_BOT_TOKEN = "ВАШ_ТОКЕН_ТЕЛЕГРАМ_БОТА";
const AUTHORIZED_TG_USER_IDS = [ВАШ_ID_1, ВАШ_ID_2];
const SHOP_KEY = "ВАШ_SHOP_KEY";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const db = new sqlite3.Database('./payments.db', (err) => {
    if (err) {
        console.error("Ошибка подключения к базе данных:", err.message);
        process.exit(1);
    }
    console.log('Подключено к базе данных payments.');
});

db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    created_at TEXT,
    customer TEXT,
    products TEXT,
    amount REAL,
    command_response TEXT
)`, (err) => {
    if (err) {
        console.error("Ошибка создания таблицы:", err.message);
    }
});

function stripColors(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/§[0-9a-fk-or]/gi, '');
}

async function checkPayments() {
    console.log("Проверка новых платежей...");
    try {
        const res = await fetch("https://easydonate.ru/api/v3/plugin/EasyDonate.LastPayments/getPayments", {
            headers: { "Shop-Key": SHOP_KEY }
        });

        if (!res.ok) {
            console.log(`❌ Запрос к API завершился с ошибкой: ${res.status}`);
            const errorBody = await res.text();
            console.log(`❌ Тело ошибки API: ${errorBody}`);
            return;
        }

        const data = await res.json();
        if (!data.success || !Array.isArray(data.response)) {
            console.log("❌ Не удалось получить платежи или неверный формат ответа:", data);
            return;
        }

        if (data.response.length === 0) {
            console.log("ℹ️ Новых платежей не найдено.");
            return;
        }

        for (const payment of data.response) {
            const paymentId = payment.id;

            const existingPayment = await new Promise((resolve, reject) => {
                db.get("SELECT id FROM payments WHERE id = ?", [paymentId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existingPayment) {
                continue;
            }

            const name = payment.customer;
            const createdAtFromAPI = payment.created_at;
            const displayDate = DateTime.fromSQL(createdAtFromAPI, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm:ss');

            const cost = parseFloat(payment.enrolled).toFixed(2);
            const server = payment.server?.name || "Не указан";
            const products = payment.products.map(p => p.name).join(", ");

            const commandLog = payment.sent_commands?.map(c =>
                `⤷ ${c.command}\n> ${stripColors(c.response)}`
            ).join("\n") || "нет данных";


            const message = `
💸 <b>Новая покупка!</b>
👤 <b>Игрок:</b> ${name}
🛍️ <b>Товары:</b> ${products}
💳 <b>Сумма:</b> ${cost} ₽
🖥️ <b>Сервер:</b> ${server}
📅 <b>Дата:</b> ${displayDate} (МСК)
📦 <b>Выданные команды:</b>
<pre>${commandLog}</pre>
            `.trim().replace(/^\s*\n/gm, '');

            db.run("INSERT INTO payments (id, created_at, customer, products, amount, command_response) VALUES (?, ?, ?, ?, ?, ?)", [
                paymentId,
                createdAtFromAPI,
                name,
                products,
                payment.enrolled,
                commandLog
            ], function(err) {
                if (err) {
                    console.error("Ошибка добавления в БД:", err.message);
                } else {
                    console.log(`✅ Платеж ID ${paymentId} добавлен в БД. Уведомление отправляется...`);
                    AUTHORIZED_TG_USER_IDS.forEach(userId => {
                        bot.sendMessage(userId, message, { parse_mode: "HTML" })
                            .catch(error => console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error.message));
                    });
                }
            });
        }
    } catch (error) {
        console.error("❌ Ошибка при проверке платежей:", error);
    }
}

function scheduleDailyReport() {
    const now = DateTime.now().setZone('Europe/Moscow');
    const nextMidnight = now.plus({ days: 1 }).startOf('day');
    const delay = nextMidnight.diff(now).as('milliseconds');

    console.log(`Ежедневный автоматический отчет запланирован на: ${nextMidnight.toISO()}. Запустится через ${Math.round(delay / 1000 / 60)} минут.`);

    setTimeout(() => {
        sendDailySummary(false);
        scheduleDailyReport();
    }, delay);
}

function sendDailySummary(isStartupCall = false) {
    const reportDateTime = DateTime.now().setZone('Europe/Moscow').minus({ days: 1 });
    const dateForQuery = reportDateTime.toFormat('yyyy-MM-dd');
    const displayDate = reportDateTime.toFormat('dd.MM.yyyy');

    if (isStartupCall) {
        console.log(`Запрос на формирование отчета за ${displayDate} (МСК) при запуске скрипта.`);
    } else {
        console.log(`Формирование ежедневного автоматического отчета за ${displayDate} (данные из БД за ${dateForQuery}).`);
    }

    db.all(
        `SELECT customer, products, amount FROM payments WHERE DATE(created_at) = ?`,
        [dateForQuery],
        (err, rows) => {
            if (err) {
                console.error("Ошибка БД при формировании отчета:", err.message);
                AUTHORIZED_TG_USER_IDS.forEach(userId => {
                    bot.sendMessage(userId, `Ошибка при формировании отчета за ${displayDate}: ${err.message}`)
                        .catch(e => console.error("Ошибка отправки сообщения об ошибке отчета:", e));
                });
                return;
            }

            console.log(`Найдено ${rows.length} платежей за ${dateForQuery}.`);

            if (rows.length === 0) {
                const noPaymentMessage = `📊 <b>Итоги за ${displayDate} (МСК)</b>\n\nЗа ${isStartupCall ? 'этот (предыдущий)' : 'этот'} день покупок не было.`;
                AUTHORIZED_TG_USER_IDS.forEach(userId => {
                    bot.sendMessage(userId, noPaymentMessage, { parse_mode: "HTML" })
                        .catch(e => console.error("Ошибка отправки отчета 'нет покупок':", e));
                });
                console.log(`📬 Итог "нет покупок" отправлен за ${displayDate}`);
                return;
            }

            const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0).toFixed(2);
            const summaryDetails = rows.map(r => `— ${r.customer}: ${r.products} (${Number(r.amount).toFixed(2)} ₽)`).join('\n');

            const message = `
📊 <b>Итоги за ${displayDate} (МСК)</b> ${isStartupCall ? '(отчет при запуске)' : ''}
🧾 <b>Всего покупок:</b> ${rows.length}
💰 <b>Общая сумма:</b> ${totalAmount} ₽

<b>Детализация:</b>
${summaryDetails}
            `.trim().replace(/^\s*\n/gm, '');

            AUTHORIZED_TG_USER_IDS.forEach(userId => {
                bot.sendMessage(userId, message, { parse_mode: "HTML" })
                    .catch(e => console.error("Ошибка отправки итогового отчета:", e));
            });

            console.log(`📬 Итог за ${displayDate} отправлен: ${rows.length} покупок, ${totalAmount} ₽`);
        }
    );
}

console.log("Запуск бота...");

checkPayments().catch(err => console.error("Ошибка при первоначальной проверке платежей:", err));
console.log("Попытка сформировать отчет за предыдущий день при запуске...");
sendDailySummary(true); 
setInterval(checkPayments, 10 * 60 * 1000);
scheduleDailyReport();

console.log(`Бот запущен. Уведомления будут отправляться пользователям: ${AUTHORIZED_TG_USER_IDS.join(', ')}`);
console.log("Проверка платежей каждые 10 минут.");
console.log("Ежедневный отчет будет автоматически отправляться в 00:00 по МСК.");
console.log("При запуске также будет попытка отправить отчет за предыдущий день.");


process.on('SIGINT', () => {
    console.log("Остановка бота...");
    db.close((err) => {
        if (err) {
            console.error("Ошибка закрытия БД:",err.message);
        }
        console.log('Соединение с базой данных закрыто.');
        process.exit(0);
    });
});