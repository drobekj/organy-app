@echo off
cd /d "%~dp0"
python publish_fingering_pdfs.py --publish
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" echo Publikace nebyla uspesne dokoncena. Navod: R74_README.md
pause
exit /b %result%
