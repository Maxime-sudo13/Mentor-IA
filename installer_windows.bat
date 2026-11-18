@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo    Installation de Mentor IA
echo ============================================
echo.

where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo [!] Python n'est pas installe.
  echo     Installe-le depuis https://www.python.org/downloads/
  echo     IMPORTANT : coche "Add Python to PATH" pendant l'installation.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
echo [OK] Python trouve.

where ollama >nul 2>nul
if errorlevel 1 (
  echo.
  echo [i] Ollama ^(l'IA locale gratuite^) n'est pas installe.
  echo     Mentor IA fonctionne sans, mais le tuteur sera limite aux reponses guidees.
  echo     Pour l'installer : https://ollama.com/download  puis relance ce fichier.
  start https://ollama.com/download
  pause
  exit /b 0
)
echo [OK] Ollama trouve.

ollama list | findstr /i "qwen" >nul
if not errorlevel 1 (
  echo [OK] Un modele Qwen est deja installe : Mentor IA l'utilisera automatiquement.
  goto fin
)
for /f "delims=" %%m in ('%PY% -c "import json;print(json.load(open('config.json',encoding='utf-8'))['modele'])"') do set MODELE=%%m
echo.
echo Telechargement du modele %MODELE% (environ 2 Go, une seule fois)...
ollama pull %MODELE%
echo.
:fin
echo.
echo Installation terminee. Lance Mentor IA avec "lancer_windows.bat".
pause
