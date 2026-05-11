#!/bin/bash

# ========================================================
# TLP Super Portable Switcher - By Flessan
# Lokasi Kerja: ~/Destop (Folder Eksperimen Thio)
# Fitur: Auto-Deploy, Auto-Toggle, Anti-Bentrok
# ========================================================

# 1. SETUP VARIABEL LOKASI
# Mencari folder Desktop secara dinamis (mendukung Bahasa Indonesia/Inggris)
FOLDER_KERJA=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Destop")
NAMA_SKRIP="tlp-control.sh"
PATH_SKRIP="$FOLDER_KERJA/$NAMA_SKRIP"
PATH_DESKTOP="$FOLDER_KERJA/TLP-Switch.desktop"
URL_SUMBER="https://flessan.pages.dev/linux/tlp.sh"

function print_message() {
    echo -e "\n\e[1;34m[$1]\e[0m $2"
}

# 2. FUNGSI AUTO-DEPLOY (Menanamkan diri di Destop)
function deploy_system() {
    mkdir -p "$FOLDER_KERJA"

    # Simpan skrip fisik jika belum ada atau sedang dijalankan via curl
    if [ ! -f "$PATH_SKRIP" ]; then
        print_message "SETUP" "Menyimpan skrip permanen ke $PATH_SKRIP..."
        curl -s "$URL_SUMBER" > "$PATH_SKRIP"
        chmod +x "$PATH_SKRIP"
    fi

    # Buat Ikon Desktop (Panggung Khusus)
    if [ ! -f "$PATH_DESKTOP" ]; then
        print_message "SETUP" "Membuat aplikasi di Desktop..."
        cat <<EOF > "$PATH_DESKTOP"
[Desktop Entry]
Name=TLP Switcher
Comment=Klik untuk Ganti Mode Baterai ala Flessan
Exec=konsole --hold -e bash "$PATH_SKRIP"
Icon=battery-saver
Terminal=false
Type=Application
Categories=System;Settings;
EOF
        chmod +x "$PATH_DESKTOP"
        print_message "SUCCESS" "Shortcut 'TLP-Switch.desktop' sudah siap di Destop!"
    fi
}

# 3. FUNGSI CEK DEPENDENSI
function check_install_tlp() {
    if ! command -v tlp &> /dev/null; then
        print_message "INFO" "TLP belum terpasang. Mengunduh..."
        sudo pacman -S --noconfirm tlp
        sudo systemctl disable tlp
        print_message "SUCCESS" "TLP berhasil diinstal."
    fi
}

# 4. FUNGSI STATUS BATERAI
function show_status() {
    LEVEL="/sys/class/power_supply/BAT1/capacity"
    STAT="/sys/class/power_supply/BAT1/status"
    if [ -f "$LEVEL" ]; then
        echo -e "\e[1;32m>>> Baterai: $(cat $LEVEL)% [$(cat $STAT)] <<<\e[0m"
    fi
}

# 5. LOGIKA TOGGLE (INTI PROGRAM)
function activate_power_saving() {
    print_message "MODE" "Mengaktifkan Mode HEMAT (Baterai Awet)..."
    # Menendang keluar power-profiles-daemon agar tidak bentrok (Job Canceled)
    sudo systemctl stop power-profiles-daemon
    sudo systemctl mask power-profiles-daemon
    
    # Menghidupkan TLP
    sudo systemctl unmask tlp
    sudo systemctl start tlp
    sudo tlp bat
    # Notifikasi Pop-up (KDE/GNOME)
    notify-send "Power Mode" "Mode Hemat Baterai AKTIF" -i battery-low
}

function deactivate_power_saving() {
    print_message "MODE" "Mengaktifkan Mode NORMAL (Ngebut!)..."
    # Mematikan TLP
    sudo systemctl stop tlp
    sudo systemctl mask tlp
    
    # Menghidupkan kembali pengatur daya bawaan desktop
    sudo systemctl unmask power-profiles-daemon
    sudo systemctl start power-profiles-daemon
    # Notifikasi Pop-up
    notify-send "Power Mode" "Mode Performa NORMAL" -i battery-full
}

# ================================
# MAIN EXECUTION
# ================================

clear
echo "==========================================="
echo "   🔋 TLP PORTABLE SWITCHER BY FLESSAN 🔋   "
echo "==========================================="

deploy_system
check_install_tlp

# Deteksi status TLP saat ini
STATUS=$(systemctl is-active tlp)

echo ""
show_status
echo ""

if [ "$STATUS" = "active" ]; then
    deactivate_power_saving
else
    activate_power_saving
fi

echo ""
show_status
echo -e "\n\e[1;33mSelesai! Mode berhasil diubah.\e[0m"
echo "Tekan apa saja untuk menutup panggung ini... ^^"
read -n1 -s
