@echo off
rem Levanta el backend local (puerto 5000) y la app web (puerto 8090) juntos.
rem La app apunta a http://localhost:5000 (ver .env); sin el backend el login
rem dice "Failed to fetch".
rem Cada uno abre en su ventana: cerrarla detiene ese servidor.

echo.
netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul
if %errorlevel%==0 (
  echo [OK] Backend ya estaba corriendo en el puerto 5000.
) else (
  echo [..] Iniciando backend en el puerto 5000 ^(ventana nueva^)...
  start "CrediMaster backend (5000)" cmd /k "cd /d C:\00\credimasterweb\credimaster-backend && npm run dev"
)

netstat -ano | findstr /R /C:":8090 .*LISTENING" >nul
if %errorlevel%==0 (
  echo [OK] La app web ya estaba corriendo en el puerto 8090.
) else (
  echo [..] Iniciando la app web en el puerto 8090 ^(ventana nueva^)...
  start "CrediApp2 web (8090)" cmd /k "cd /d C:\00\CrediApp2.0\CrediApp2 && npx expo start --web --port 8090"
)

echo.
echo Cuando ambos digan listo, abre http://localhost:8090
echo.
pause
