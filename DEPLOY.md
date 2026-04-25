# Деплой на VPS

## Требования
- VPS с Ubuntu 22.04
- Домен с A-записью, указывающей на IP вашего VPS
- SSH доступ к VPS

## Первый деплой

Подключитесь к VPS по SSH и выполните одну команду:

```bash
sudo apt install git -y && git clone https://github.com/wiowxo/conference-scoring.git && cd conference-scoring && sudo bash setup.sh
```

Скрипт автоматически:
- Установит Docker
- Установит certbot (новая версия через snap)
- Запросит домен, email и пароль БД
- Получит SSL сертификат
- Соберёт и запустит все контейнеры

Скрипт спросит три вещи:
1. Доменное имя (например: `rgsu-conf.ru`)
2. Email для SSL сертификата
3. Пароль базы данных (или нажмите Enter для автогенерации)

После завершения приложение доступно по `https://ВАШ_ДОМЕН`

Войдите: логин `admin`, пароль `admin` — система попросит сменить пароль.

## Обновление приложения

```bash
cd conference-scoring
git pull
sudo docker compose --env-file .env.production up -d --build
```

## Полезные команды

Все команды выполняются из папки `conference-scoring`:

```bash
# Логи приложения (в реальном времени)
sudo docker compose logs -f app

# Статус всех контейнеров
sudo docker compose ps

# Перезапустить только приложение
sudo docker compose restart app

# Остановить всё
sudo docker compose down

# Остановить и удалить все данные включая БД (ОСТОРОЖНО!)
sudo docker compose down -v
```

## Сброс пароля организатора

```bash
sudo docker compose exec app node scripts/reset-password.js
```

## Полная очистка базы данных

```bash
sudo docker compose exec app sh scripts/reset-password.sh --wipe
```

## Если что-то пошло не так

```bash
# Посмотреть логи приложения
sudo docker compose logs app

# Посмотреть логи базы данных
sudo docker compose logs db

# Посмотреть логи nginx
sudo docker compose logs nginx
```

Частые проблемы:
- `502 Bad Gateway` — подождите 1-2 минуты, приложение ещё запускается
- SSL ошибка — убедитесь что домен указывает на IP вашего VPS и порт 80 открыт (`sudo ufw allow 80`)
- База данных не запускается — проверьте `.env.production` файл
