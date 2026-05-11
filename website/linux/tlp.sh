#!/bin/bash

# ========================================================
# Script Pengelolaan Mode Hemat Daya TLP - By Flessan
# Optimized for Universal Run (curl | bash)
# ========================================================

# Variabel lokasi agar konsisten
FOLDER_KERJA="$HOME/Destop"
PATH_SKRIP="$FOLDER_KERJA/tlp-control.sh"
PATH_DESKTOP="$FOLDER_KERJA/TLP-Switch.desktop"
URL_SUMBER="https://pages.dev"

function print_message() {
    echo -e "\n[$1]\n$2\n"
}

# --- FITUR AUTO DEPLOY (PENTING) ---
function deploy_script() {
    mkdir -p "$FOLDER_KERJA"
    
    # Jika dijalankan via curl, simpan dirinya sendiri ke Destop
    if [ ! -f "$PATH_SKRIP" ]; then
        print_message "DEPLOY" "Menyimpan skrip permanen ke $PATH_SKRIP..."
        curl -s "$URL_SUMBER" > "$PATH_SKRIP"
        chmod +x "$PATH_SKRIP"
    fi

    # Buat Ikon Desktop jika belum ada
    if [ ! -f "$PATH_DESKTOP" ]; then
        print_message "INFO" "Membuat ikon aplikasi di Desktop..."
        cat <<EOF > "$PATH_DESKTOP"
[Desktop Entry]
Name=TLP Switcher
Comment=Klik untuk Ganti Mode Baterai
Exec=konsole -e bash "$PATH_SKRIP"
Icon=battery-low
Terminal=false
Type=Application
EOF
        chmod +x "$PATH_DESKTOP"
        print_message "INFO" "Shortcut 'TLP-Switch.desktop' siap di Destop!"
    fi
}

function check_install_tlp() {
    if ! command -v tlp &> /dev/null; then
        print_message "INFO" "System detects TLP is not installed. Installing..."
        sudo pacman -S --noconfirm tlp
        sudo systemctl disable tlp
        print_message "INFO" "TLP installation completed!"
    fi
}

function show_battery_status() {
    BATTERY_LEVEL_FILE="/sys/class/power_supply/BAT1/capacity"
    BATTERY_STATUS_FILE="/sys/class/power_supply/BAT1/status"
    if [ -f "$BATTERY_LEVEL_FILE" ]; then
        echo -e "Level baterai: $(cat $BATTERY_LEVEL_FILE)% | Status: $(cat $BATTERY_STATUS_FILE)"
    fi
}

function activate_power_saving() {
    print_message "MODE" "Mengaktifkan Mode Hemat Daya (TLP)..."
    sudo systemctl stop power-profiles-daemon
    sudo systemctl unmask tlp
    sudo systemctl start tlp
    sudo tlp bat
    print_message "MODE" "Mode hemat daya aktif!"
}

function deactivate_power_saving() {
    print_message "MODE" "Menonaktifkan Mode Hemat Daya (TLP)..."
    sudo systemctl stop tlp
    sudo systemctl mask tlp
    sudo systemctl restart power-profiles-daemon
    print_message "MODE" "Mode normal aktif!"
}

# ================================
# Main Program
# ================================

# 1. Pastikan skrip ter-deploy dan TLP terpasang
deploy_script
check_install_tlp

# 2. Cek Status & Toggle
STATUS=$(systemctl is-active tlp)
show_battery_status

if [ "$STATUS" = "active" ]; then
    read -p "Mode hemat AKTIF. Matikan? (y/n): " CHOICE
    [[ "$CHOICE" =~ ^[Yy]$ ]] && deactivate_power_saving || echo "Tetap aktif."
else
    read -p "Mode hemat MATI. Aktifkan? (y/n): " CHOICE
    [[ "$CHOICE" =~ ^[Yy]$ ]] && activate_power_saving || echo "Tetap mati."
fi

show_battery_status
echo -e "\nSelesai! Tekan apa saja untuk keluar... ^^"
read -n1 -s
