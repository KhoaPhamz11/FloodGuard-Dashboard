FOLDER STRUCTURE

dashboard/
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── css/
│   │   │   ├── style.css
│   │   │   └── dashboard.css
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── dashboard.js
│   │   │   ├── chartHandler.js
│   │   │   ├── stationManager.js
│   │   │   └── alertManager.js
│   │   └── assets/
│   │       └── images/
│   ├── package.json
│   └── README.md
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── station.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── data.py
│   │   │   └── realtime.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── mongodb_service.py
│   │   │   └── data_processor.py
│   │   └── config/
│   │       ├── __init__.py
│   │       └── database.py
│   ├── requirements.txt
│   ├── .env
│   └── README.md
│
├── docker-compose.yml
├── .gitignore
└── README.md