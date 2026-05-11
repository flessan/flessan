#!/bin/bash

# ========================================================
# TLP Portable Switcher - By Flessan
# Lokasi: ~/Destop (Folder Eksperimen)
# ========================================================

# Variabel Lokasi
FOLDER_KERJA="$HOME/Destop"
NAMA_SKRIP="tlp-control.sh"
PATH_SKRIP="$FOLDER_KERJA/$NAMA_SKRIP"
PATH_DESKTOP="$FOLDER_KERJA/TLP-Switch.desktop"

function print_message() {
    echo -e "\n[$1]\n$2\n"
}

# 1. Fungsi Install & Setup Awal
function setup_system() {
    # Cek dan install TLP
    if ! command -v tlp &> /dev/null; then
        print_message "SETUP" "Mengunduh dependensi TLP..."
        sudo pacman -S --noconfirm tlp
        sudo systemctl disable tlp
    fi

    # Pastikan file skrip ini tersimpan di Destop
    if [ ! -f "$PATH_SKRIP" ]; then
        print_message "SETUP" "Menyimpan skrip ke $PATH_SKRIP"
        cp "$0" "$PATH_SKRIP" 2>/dev/null || cat "$0" > "$PATH_SKRIP"
        chmod +x "$PATH_SKRIP"
    fi

    # Buat Ikon Desktop (Panggung Khusus)
    if [ ! -f "$PATH_DESKTOP" ]; then
        print_message "SETUP" "Membuat panggung aplikasi di Desktop..."
        cat <<EOF > "$PATH_DESKTOP"
[Desktop Entry]
Name=TLP Switcher
Comment=Klik untuk Ganti Mode Baterai ala Flessan
Exec=konsole --hold -e bash "$PATH_SKRIP"
Icon=battery-low
Terminal=false
Type=Application
EOF
        chmod +x "$PATH_DESKTOP"
    fi
}

function show_battery_status() {
    BATTERY_LEVEL_FILE="/sys/class/power_supply/BAT1/capacity"
    BATTERY_STATUS_FILE="/sys/class/power_supply/BAT1/status"
    if [ -f "$BATTERY_LEVEL_FILE" ]; then
        echo -e ">>> Level Baterai: $(cat $BATTERY_LEVEL_FILE)% [$(cat $BATTERY_STATUS_FILE)] <<<"
    fi
}

function toggle_power() {
    STATUS=$(systemctl is-active tlp)
    
    if [ "$STATUS" = "active" ]; then
        print_message "MODE" "Mematikan Mode Hemat (Back to Normal)..."
        sudo systemctl stop tlp
        sudo systemctl mask tlp
        sudo systemctl unmask power-profiles-daemon
        sudo systemctl restart power-profiles-daemon
        echo "Hasil: Performa kembali kencang!"
    else
        print_message "MODE" "Mengaktifkan Mode Hemat (Baterai Awet)..."
        sudo systemctl stop power-profiles-daemon
        sudo systemctl unmask tlp
        sudo systemctl start tlp
        sudo tlp bat
        echo "Hasil: Mode hemat aktif!"
    fi
}

# ================================
# Main Program
# ================================

# Pastikan folder Destop ada (biar nggak error)
mkdir -p "$FOLDER_KERJA"

setup_system
show_battery_status
toggle_power
show_battery_status

echo -e "\nSelesai! Ikon aplikasi sudah siap di ~/Destop."
echo "Tekan apa saja untuk keluar... ^^"
read -n1 -s
