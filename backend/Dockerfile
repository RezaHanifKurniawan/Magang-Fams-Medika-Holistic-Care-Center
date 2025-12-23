FROM python:3.10

WORKDIR /app

RUN bash -c "curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg"

RUN bash -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list'

RUN apt update -y

RUN apt install google-chrome-stable -y

COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

RUN pip install webdriver-manager

COPY . .

CMD [ "gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--log-level", "debug", "app:app" ]
