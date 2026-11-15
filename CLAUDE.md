# CrediApp2 (app del gestor de cobro de CrediMaster)

App móvil Expo / React Native para gestores de cobro y oficiales de crédito. Habla con el backend de CrediMaster
(`EXPO_PUBLIC_CREDIMASTER_API_URL`; producción: `https://api.credimaster.app`).

Contexto del proyecto (decisiones, módulos, errores ya corregidos, reglas del dueño): repositorio privado https://github.com/jdramos/credimaster-contexto, carpeta memoria/ (empezar por memoria/MEMORY.md). Léelo antes de cambiar algo no trivial.

## Reglas de trabajo
- Este repositorio solo tiene la rama `main`. Commits en español, claros.
- Muchas pantallas trabajan sin señal con una cola de sincronización (`src/utils`, syncManager). Todo lo nuevo que guarde datos debe pensar en eso.
- Las funciones por empresa se encienden con políticas de crédito (`getCreditPolicies`), por ejemplo `solicitud_cliente_nuevo_hoja` o `cliente_nuevo_prospecto`.
- Las fotos usan la cámara dentro de la app (`InAppCameraHost`, `src/utils/imagePicker.js`), no la del sistema (en Samsung mataba la app).
- No hay lint configurado: revisar a mano que no queden variables sin definir.

## Compilar el APK (solo si el dueño lo pide)
1. `.env`: cambiar `EXPO_PUBLIC_CREDIMASTER_API_URL` a `https://api.credimaster.app` (guardar copia y restaurar después).
2. Borrar `android/app/build/generated/assets` y `android/app/build/intermediates/assets` para forzar el bundle nuevo.
3. Desde `android/`, con `NODE_ENV=production`: `gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a`.
4. Verificar el bundle con búsquedas ASCII: `localhost:5000` debe dar 0 y `api.credimaster.app` 1 (Hermes guarda los textos con acentos en UTF-16).
5. Se firma con `android/app/debug.keystore` (no está respaldado en ningún lado). Subir a Wasabi con enlace de 7 días.
