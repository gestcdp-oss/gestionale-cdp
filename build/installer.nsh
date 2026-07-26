; Personalizzazioni del programma di installazione di TR.A.V.I.
; L'installazione avviene con un solo clic; al termine viene mostrato un
; messaggio chiaro sull'esito. Durante gli aggiornamenti automatici (modalità
; silenziosa) non compare nulla.

Unicode true

!macro customInstall
  ; Verifica reale: il programma deve essere stato copiato. Antivirus e criteri
  ; aziendali possono impedirlo senza dare alcun avviso.
  IfFileExists "$INSTDIR\TRAVI.exe" travi_ok 0
    IfSilent travi_muto_errore 0
      MessageBox MB_ICONSTOP|MB_OK "INSTALLAZIONE NON RIUSCITA$\r$\n$\r$\nIl programma non è stato copiato sul computer.$\r$\n$\r$\nLa causa più probabile è un blocco dell'antivirus o dei criteri di sicurezza aziendali.$\r$\n$\r$\nChiedi all'assistenza informatica di autorizzare TR.A.V.I. e riprova."
    travi_muto_errore:
    SetErrorLevel 2
    Abort "Installazione non riuscita."
  travi_ok:

  IfSilent travi_fine 0
    MessageBox MB_ICONINFORMATION|MB_OK "INSTALLAZIONE RIUSCITA$\r$\n$\r$\nTR.A.V.I. è stato installato correttamente.$\r$\n$\r$\nAvvia il programma cliccando sull'icona TR.A.V.I. che trovi sul desktop.$\r$\n$\r$\nPuoi cancellare il file di installazione che hai scaricato."
  travi_fine:
!macroend
