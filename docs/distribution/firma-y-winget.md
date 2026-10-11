# Firma de Windows y winget

Hoy el instalador de Booki solo lleva la firma del actualizador de Tauri. Esa firma
demuestra que una actualización viene de Booki, pero Windows no la reconoce. Por eso
SmartScreen avisa de "editor desconocido" al instalar, y winget acepta el paquete pero
avisa igual.

## 1. Firma Authenticode

Hay dos caminos. Los dos firman el `.exe` de Booki y los instaladores NSIS y MSI.

### Opción recomendada: Azure Trusted Signing

Es la más barata (unos 10 USD al mes) y no hay certificado que guardar: la clave vive
en Azure. Es el servicio de Microsoft, así que SmartScreen construye reputación con ella rápido.

1. Crea una cuenta de Trusted Signing y un perfil de certificado de tipo "Public
   Trust" en el portal de Azure. La verificación de identidad es de persona física o
   empresa.
2. Crea una aplicación (service principal) con el rol "Trusted Signing Certificate
   Profile Signer".
3. En GitHub, en *Settings › Secrets and variables › Actions*, guarda
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` y `AZURE_CLIENT_SECRET`.
4. Instala la herramienta en el job de `release.yml`, antes de compilar:

   ```yaml
   - name: Install Trusted Signing client
     run: cargo install trusted-signing-cli --locked
   ```

5. En `src-tauri/tauri.conf.json`, dentro de `bundle.windows`, añade el comando de
   firma (Tauri lo ejecuta con cada archivo en `%1`):

   ```json
   "signCommand": "trusted-signing-cli -e https://<región>.codesigning.azure.net -a <cuenta> -c <perfil> -d Booki %1"
   ```

6. Pasa los tres secretos como variables de entorno a los pasos "Build signed…" de
   `release.yml`.

### Alternativa: certificado OV o EV propio

Compras un certificado de firma de código a una autoridad (Certum, Sectigo…). Desde
2023 la clave privada tiene que vivir en hardware (un token o un HSM en la nube), así
que la firma en CI necesita el servicio en la nube del proveedor. Cada proveedor da su
propio `signCommand`. En los dos tipos, OV y EV, SmartScreen deja de avisar a medida
que el instalador acumula descargas.

### Cómo comprobarlo

En Windows, botón derecho sobre el instalador › *Propiedades* › *Firmas digitales*.
Debe aparecer el editor. También sirve `Get-AuthenticodeSignature .\Booki_X_x64-setup.exe`
en PowerShell, que debe responder `Valid`.

## 2. winget

Cada publicación genera los manifiestos de winget como artefacto aparte
(`booki-winget-manifests`) con `scripts/winget-manifest.mjs`. Ese script calcula el
SHA-256 de los instaladores x64 y ARM64 y apunta a las URLs de la versión publicada.
No cambia nada de lo que se publica.

Para enviarlo:

1. Descarga el artefacto `booki-winget-manifests` de la ejecución de *Release*.
2. Haz un fork de `microsoft/winget-pkgs` y copia la carpeta en
   `manifests/p/punkable/Booki/<versión>/`.
3. Compruébalo con `winget validate --manifest <carpeta>` y, si quieres, instálalo
   con `winget install --manifest <carpeta>`.
4. Abre un PR. Su bot lo valida y, al fusionarse, `winget install punkable.Booki`
   funciona para todos.

Para las versiones siguientes, `wingetcreate update punkable.Booki` hace los pasos 2 a
4 automáticamente, si se prefiere.

Sin la firma Authenticode, winget instala Booki igual, pero SmartScreen sigue avisando
la primera vez que se ejecuta.
