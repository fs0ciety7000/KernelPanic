cd /srv/lims/exports
ls -l
lpstat -o
cd
ls /media/srahmani/
ls /media/srahmani/KINGSTON
mkdir -p /media/srahmani/KINGSTON/backup_T1
cp /srv/lims/exports/STA_PFAS_T1_ORIGINAL.csv /srv/lims/exports/STA_PFAS_T1_VALIDE.csv /media/srahmani/KINGSTON/backup_T1/
cp ~/Maildir/cur/1775115600.M201P1300.lab-qa-03.eml ~/Maildir/.Sent/cur/1775118300.M202P1310.lab-qa-03.eml /media/srahmani/KINGSTON/backup_T1/
sha256sum /media/srahmani/KINGSTON/backup_T1/*
sync
udisksctl unmount -b /dev/sdb1
exit
