// ==================== UTILITIES ====================
function getSettings() {
    return {
        apiKey: localStorage.getItem('apiKey') || 'secret_something_aman',
        userId: localStorage.getItem('userId') || 'user_demo'
    };
}

async function apiFetch(url, options = {}) {
    const { apiKey } = getSettings();
    options.headers = options.headers || {};
    options.headers['X-API-Key'] = apiKey;
    options.headers['Content-Type'] = 'application/json';

    if (options.body && typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, options);
    if (res.status === 401) {
        showToast('Sesi berakhir! Silakan login ulang.', 'error');
        setTimeout(() => window.location.href = '/login.html', 2000);
        throw new Error('Unauthorized');
    }
    return res;
}

function formatRupiah(num) {
    return 'Rp ' + (num || 0).toLocaleString('id-ID');
}

function formatCurrencyInput(inputElement) {
    if (!inputElement) return;
    inputElement.addEventListener('input', function (e) {
        let value = e.target.value.replace(/[^0-9]/g, '');
        if (value) {
            value = parseInt(value).toLocaleString('id-ID');
        }
        e.target.value = value;

        const hiddenInput = document.getElementById(e.target.id.replace('_formatted', ''));
        if (hiddenInput) {
            hiddenInput.value = value.replace(/[^0-9]/g, '') || '0';
        }
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = `fixed top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 transition-all duration-300 text-sm font-medium ${type === 'error' ? 'bg-red-500' : 'bg-gray-800'} text-white opacity-100`;
    setTimeout(() => {
        toast.classList.replace('opacity-100', 'opacity-0');
    }, 3000);
}

function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('apiKey');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('neonSession');

    if (window.authClient) {
        window.authClient.signOut();
    }

    window.location.href = '/login.html';
}

// Avatar fallback generator (NO ui-avatars!)
function getAvatarFallback(name) {
    const initial = (name || 'U').charAt(0).toUpperCase();
    const colors = ['8b5cf6', '3b82f6', '10b981', 'f59e0b', 'ef4444', 'ec4899', '6366f1', '14b8a6'];
    const colorIndex = (name || 'U').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    const bgColor = colors[colorIndex];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#${bgColor}"/>
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
              font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="600" fill="white">
            ${initial}
        </text>
    </svg>`;

    return 'data:image/svg+xml;base64,' + btoa(svg);
}

function getAvatarUrl(profile) {
    if (profile?.avatar_url && !profile.avatar_url.includes('ui-avatars.com')) {
        return profile.avatar_url;
    }
    return getAvatarFallback(profile?.display_name || profile?.name || 'User');
}

// ==================== GLOBAL VARIABLES ====================
let currentProfile = null;
let currentGoalId = null;
let selectedNoteColor = 'white';

// ==================== PROFILE MANAGEMENT ====================
async function loadUserProfile() {
    const { userId } = getSettings();
    console.log('🔍 Loading profile for user:', userId);

    // 1. Try backend first
    try {
        const res = await apiFetch(`/api/profiles/me?user_id=${userId}`);
        if (res.ok) {
            const { data } = await res.json();
            console.log('✅ Profile loaded from DB:', data);
            currentProfile = data;
            updateProfileUI(data);
            localStorage.setItem('userProfile', JSON.stringify(data));
            return data;
        } else {
            console.warn('⚠️ Backend profile fetch failed:', res.status);
        }
    } catch (error) {
        console.warn('⚠️ Backend profile fetch error:', error.message);
    }

    // 2. Fallback: localStorage
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
        try {
            currentProfile = JSON.parse(storedProfile);
            console.log('✅ Profile loaded from localStorage:', currentProfile);
            updateProfileUI(currentProfile);
            return currentProfile;
        } catch (error) {
            console.warn('⚠️ Failed to parse localStorage profile:', error);
        }
    }

    // 3. Fallback: Neon Auth session
    try {
        if (window.authClient) {
            console.log('🔄 Trying to fetch from Neon Auth session...');
            const result = await window.authClient.getSession();

            let user = null;
            if (result?.data?.session?.user) {
                user = result.data.session.user;
            } else if (result?.data?.user) {
                user = result.data.user;
            } else if (result?.user) {
                user = result.user;
            }

            if (user) {
                console.log('✅ Found user in session:', user);
                currentProfile = {
                    user_id: user.id,
                    display_name: user.name || user.email?.split('@')[0] || 'User',
                    avatar_url: user.image,
                    email: user.email,
                    donation_streak: 0,
                    total_donations: 0,
                };
                updateProfileUI(currentProfile);
                localStorage.setItem('userProfile', JSON.stringify(currentProfile));
                return currentProfile;
            }
        }
    } catch (error) {
        console.warn('⚠️ Failed to fetch from session:', error);
    }

    // 4. Ultimate fallback: Dummy profile with SVG avatar
    console.warn('⚠️ All fallbacks failed, using dummy profile');
    currentProfile = {
        user_id: userId,
        display_name: userId,
        avatar_url: null, // Will use SVG fallback
        donation_streak: 0,
        total_donations: 0,
    };
    updateProfileUI(currentProfile);
    return currentProfile;
}

function updateProfileUI(profile) {
    if (!profile) return;

    const avatarUrl = getAvatarUrl(profile);
    const displayName = profile.display_name || profile.username || 'User';

    // Navbar
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    if (userAvatar) userAvatar.src = avatarUrl;
    if (userName) userName.textContent = displayName;

    // Menu
    const menuAvatar = document.getElementById('menuAvatar');
    const menuName = document.getElementById('menuName');
    const menuUsername = document.getElementById('menuUsername');
    const menuEmail = document.getElementById('menuEmail');
    const roleBadge = document.getElementById('roleBadge');
    const statDonations = document.getElementById('statDonations');
    const statStreak = document.getElementById('statStreak');

    if (menuAvatar) menuAvatar.src = avatarUrl;
    if (menuName) menuName.textContent = displayName;
    if (menuUsername) menuUsername.textContent = `@${profile.username || 'username'}`;
    if (menuEmail) menuEmail.textContent = profile.email || '';
    if (statDonations) statDonations.textContent = profile.total_donations || 0;
    if (statStreak) statStreak.textContent = profile.donation_streak || 0;

    // Role badge
    if (roleBadge && profile.role && profile.role !== 'user') {
        roleBadge.classList.remove('hidden');
        const roleMap = {
            'verified': '✓ Verified',
            'admin': '👑 Admin',
            'top_donor': '🏆 Top Donor'
        };
        roleBadge.textContent = roleMap[profile.role] || profile.role;
    }

    // Streak badge
    const streakCount = document.getElementById('streakCount');
    const streakBadge = document.getElementById('streakBadge');
    if (streakCount && streakBadge) {
        if (profile.donation_streak > 0) {
            streakCount.textContent = profile.donation_streak;
            streakBadge.classList.remove('hidden');
        } else {
            streakBadge.classList.add('hidden');
        }
    }

    // Home page
    const homeUserName = document.getElementById('homeUserName');
    const homeUserEmail = document.getElementById('homeUserEmail');
    const homeAvatar = document.getElementById('homeAvatar');
    if (homeUserName) homeUserName.textContent = displayName;
    if (homeUserEmail) homeUserEmail.textContent = profile.email || '';
    if (homeAvatar) homeAvatar.src = avatarUrl;
}

function toggleProfileMenu() {
    const menu = document.getElementById('profileMenu');
    if (!menu) return;
    menu.classList.toggle('hidden');

    if (!menu.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', closeProfileMenuOutside, { once: true });
        }, 0);
    }
}

function closeProfileMenuOutside(e) {
    const menu = document.getElementById('profileMenu');
    const trigger = document.getElementById('profileTrigger');
    if (menu && trigger && !menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.classList.add('hidden');
    }
}

function closeEditProfile() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openEditProfile() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.add('hidden');

    if (!currentProfile) {
        showToast('⏳ Loading profile...', 'info');
        loadUserProfile().then((profile) => {
            if (profile) {
                openEditProfile();
            } else {
                showToast('❌ Gagal load profile', 'error');
            }
        });
        return;
    }

    const githubInput = document.getElementById('edit_github');
    const usernameInput = document.getElementById('edit_username');
    const displayNameInput = document.getElementById('edit_display_name');
    const bioInput = document.getElementById('edit_bio');
    const locationInput = document.getElementById('edit_location');
    const twitterInput = document.getElementById('edit_twitter');
    const websiteInput = document.getElementById('edit_website');
    const avatarPreview = document.getElementById('avatarPreview');
    const bannerPreview = document.getElementById('bannerPreview');

    if (githubInput) githubInput.value = currentProfile.github_username || '';
    if (usernameInput) usernameInput.value = currentProfile.username || '';
    if (displayNameInput) displayNameInput.value = currentProfile.display_name || '';
    if (bioInput) bioInput.value = currentProfile.bio || '';
    if (locationInput) locationInput.value = currentProfile.location || '';

    const socials = currentProfile.socials || {};
    if (twitterInput) twitterInput.value = socials.twitter || '';
    if (websiteInput) websiteInput.value = socials.website || '';

    if (avatarPreview) avatarPreview.src = getAvatarUrl(currentProfile);
    if (bannerPreview) bannerPreview.src = currentProfile.banner_url || '';

    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

async function viewMyProfile() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.add('hidden');

    if (!currentProfile) {
        console.warn('⚠️ currentProfile is null, attempting to reload...');
        await loadUserProfile();

        if (!currentProfile) {
            showToast('❌ Profile tidak tersedia. Silakan login ulang.', 'error');
            return;
        }
    }

    if (!currentProfile.user_id) {
        console.error('❌ currentProfile.user_id is missing:', currentProfile);
        showToast('❌ Data profile tidak valid', 'error');
        return;
    }

    await showPublicProfile(currentProfile.user_id);
}

async function showPublicProfile(identifier) {
    const content = document.getElementById('publicProfileContent');
    const modal = document.getElementById('publicProfileModal');

    if (content) content.innerHTML = '<div class="p-12 text-center">Loading...</div>';
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    try {
        const res = await apiFetch(`/api/profiles/${identifier}`);
        if (!res.ok) throw new Error('Profile not found');

        const { data: profile } = await res.json();

        const achRes = await apiFetch(`/api/achievements/${profile.user_id}`);
        const { data: achievements } = await achRes.json();

        const actRes = await apiFetch(`/api/profiles/me/activity?user_id=${profile.user_id}`);
        const { data: activity } = await actRes.json();

        if (content) content.innerHTML = renderPublicProfile(profile, achievements, activity);
    } catch (error) {
        if (content) content.innerHTML = `<div class="p-12 text-center text-red-500">❌ ${error.message}</div>`;
    }
}

function renderPublicProfile(profile, achievements = [], activity = []) {
    const socials = profile.socials || {};
    const contributionGraph = generateContributionGraph(activity);
    const avatarUrl = getAvatarUrl(profile);

    const topBadges = achievements.slice(0, 3).map(a =>
        `<div class="bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-yellow-200">${a.badge_name}</div>`
    ).join('');

    return `
        <div class="h-40 bg-gradient-to-br from-purple-500 to-indigo-600 relative">
            ${profile.banner_url ? `<img src="${profile.banner_url}" class="w-full h-full object-cover">` : ''}
            <button onclick="closePublicProfile()" class="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 rounded-full text-white transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
        
        <div class="px-6 pb-6">
            <div class="flex items-end gap-4 -mt-12 mb-4">
                <img src="${avatarUrl}" class="w-24 h-24 rounded-full border-4 border-white shadow-lg">
                <div class="flex-1 pb-2">
                    <div class="flex items-center gap-2">
                        <h2 class="text-2xl font-bold text-gray-800">${profile.display_name || 'User'}</h2>
                        ${profile.is_verified ? '<span class="text-blue-500" title="Verified">✓</span>' : ''}
                    </div>
                    <p class="text-gray-500">@${profile.username || 'username'}</p>
                </div>
            </div>
            
            ${profile.bio ? `<p class="text-gray-700 mb-4">${profile.bio}</p>` : ''}
            
            <div class="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                ${profile.location ? `<span>📍 ${profile.location}</span>` : ''}
                ${socials.github ? `<a href="https://github.com/${socials.github}" target="_blank" class="hover:text-purple-600">🐙 ${socials.github}</a>` : ''}
                ${socials.twitter ? `<a href="https://twitter.com/${socials.twitter}" target="_blank" class="hover:text-purple-600">🐦 @${socials.twitter}</a>` : ''}
                ${socials.website ? `<a href="${socials.website}" target="_blank" class="hover:text-purple-600">🔗 Website</a>` : ''}
                <span>📅 Joined ${new Date(profile.created_at).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}</span>
            </div>
            
            <div class="grid grid-cols-3 gap-3 mb-6">
                <div class="bg-gradient-to-br from-emerald-500 to-green-600 text-white p-4 rounded-xl text-center">
                    <div class="text-2xl font-bold">${profile.total_donations || 0}</div>
                    <div class="text-xs opacity-90">Donations</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-red-500 text-white p-4 rounded-xl text-center">
                    <div class="text-2xl font-bold">🔥 ${profile.donation_streak || 0}</div>
                    <div class="text-xs opacity-90">Day Streak</div>
                </div>
                <div class="bg-gradient-to-br from-purple-500 to-indigo-600 text-white p-4 rounded-xl text-center">
                    <div class="text-2xl font-bold">${achievements.length}</div>
                    <div class="text-xs opacity-90">Badges</div>
                </div>
            </div>
            
            <div class="bg-gray-50 rounded-xl p-4 mb-6">
                <h3 class="font-semibold text-gray-800 mb-3">📊 Donation Activity (Last Year)</h3>
                ${contributionGraph}
            </div>
            
            ${achievements.length > 0 ? `
                <div>
                    <h3 class="font-semibold text-gray-800 mb-3">🏆 Achievements</h3>
                    <div class="flex flex-wrap gap-2">
                        ${topBadges}
                        ${achievements.length > 3 ? `<div class="bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full">+${achievements.length - 3} more</div>` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function generateContributionGraph(activity) {
    const today = new Date();
    const cells = [];

    for (let week = 52; week >= 0; week--) {
        const weekCells = [];
        for (let day = 0; day < 7; day++) {
            const date = new Date(today);
            date.setDate(date.getDate() - (week * 7 + (6 - day)));
            const dateStr = date.toISOString().split('T')[0];

            const activityItem = activity.find(a => {
                const aDate = new Date(a.donation_date).toISOString().split('T')[0];
                return aDate === dateStr;
            });
            const amount = activityItem ? Number(activityItem.amount) : 0;

            let color = 'bg-gray-100';
            if (amount > 0) {
                if (amount < 10000) color = 'bg-emerald-200';
                else if (amount < 50000) color = 'bg-emerald-400';
                else if (amount < 100000) color = 'bg-emerald-600';
                else color = 'bg-emerald-800';
            }

            weekCells.push(`<div class="w-2.5 h-2.5 ${color} rounded-sm" title="${dateStr}: Rp ${amount.toLocaleString('id-ID')}"></div>`);
        }
        cells.push(`<div class="flex flex-col gap-0.5">${weekCells.join('')}</div>`);
    }

    return `
        <div class="flex gap-0.5 overflow-x-auto pb-2">
            ${cells.join('')}
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500 mt-2">
            <span>Less</span>
            <div class="w-2.5 h-2.5 bg-gray-100 rounded-sm"></div>
            <div class="w-2.5 h-2.5 bg-emerald-200 rounded-sm"></div>
            <div class="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></div>
            <div class="w-2.5 h-2.5 bg-emerald-600 rounded-sm"></div>
            <div class="w-2.5 h-2.5 bg-emerald-800 rounded-sm"></div>
            <span>More</span>
        </div>
    `;
}

function closePublicProfile() {
    const modal = document.getElementById('publicProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function syncGitHub() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.add('hidden');

    if (currentProfile?.github_username) {
        await fetchFromGitHubAndSave(currentProfile.github_username);
        return;
    }

    try {
        if (window.authClient) {
            const result = await window.authClient.getSession();
            let user = result?.data?.session?.user || result?.data?.user || result?.user;

            if (user && currentProfile) {
                showToast('🔄 Syncing from GitHub session...');

                const updateData = {
                    user_id: currentProfile.user_id,
                    avatar_url: user.image,
                    display_name: user.name || currentProfile.display_name,
                    bio: currentProfile.bio,
                    location: currentProfile.location,
                    socials: {
                        ...currentProfile.socials,
                        github: user.id,
                    }
                };

                const res = await apiFetch('/api/profiles/me', {
                    method: 'PUT',
                    body: updateData
                });

                if (res.ok) {
                    showToast('✅ Synced from GitHub!');
                    await loadUserProfile();
                }
            }
        }
    } catch (error) {
        showToast('❌ Sync failed: ' + error.message, 'error');
    }
}

async function fetchFromGitHub() {
    const githubUsername = document.getElementById('edit_github')?.value.trim();
    const statusEl = document.getElementById('githubStatus');

    if (!githubUsername) {
        showToast('Masukkan GitHub username', 'error');
        return;
    }

    if (statusEl) statusEl.textContent = '⏳ Fetching from GitHub...';

    try {
        const res = await apiFetch(`/api/profiles/github/${githubUsername}`);

        if (!res.ok) {
            if (statusEl) statusEl.textContent = '❌ GitHub user not found';
            return;
        }

        const { data } = await res.json();

        const avatarPreview = document.getElementById('avatarPreview');
        const displayNameInput = document.getElementById('edit_display_name');
        const bioInput = document.getElementById('edit_bio');
        const locationInput = document.getElementById('edit_location');
        const twitterInput = document.getElementById('edit_twitter');
        const websiteInput = document.getElementById('edit_website');
        const usernameInput = document.getElementById('edit_username');

        if (data.avatar_url && avatarPreview) avatarPreview.src = data.avatar_url;
        if (data.name && displayNameInput) displayNameInput.value = data.name;
        if (data.bio && bioInput) bioInput.value = data.bio;
        if (data.location && locationInput) locationInput.value = data.location;
        if (data.twitter_username && twitterInput) twitterInput.value = data.twitter_username;
        if (data.blog && websiteInput) websiteInput.value = data.blog;

        if (usernameInput && !usernameInput.value) {
            usernameInput.value = githubUsername.toLowerCase();
        }

        if (statusEl) statusEl.innerHTML = `✅ Found! <span class="opacity-75">${data.followers} followers · ${data.public_repos} repos</span>`;
    } catch (error) {
        if (statusEl) statusEl.textContent = '❌ ' + error.message;
    }
}

async function fetchFromGitHubAndSave(githubUsername) {
    if (!githubUsername) {
        showToast('GitHub username tidak tersedia', 'error');
        return;
    }

    showToast('⏳ Fetching from GitHub...');

    try {
        const res = await apiFetch(`/api/profiles/github/${githubUsername}`);

        if (!res.ok) {
            showToast('❌ GitHub user not found', 'error');
            return;
        }

        const { data } = await res.json();

        const updateData = {
            user_id: currentProfile.user_id,
            avatar_url: data.avatar_url,
            display_name: data.name || currentProfile.display_name,
            bio: data.bio || currentProfile.bio,
            location: data.location || currentProfile.location,
            github_username: githubUsername,
            socials: {
                ...currentProfile.socials,
                github: githubUsername,
                twitter: data.twitter_username || currentProfile.socials?.twitter,
                website: data.blog || currentProfile.socials?.website,
            }
        };

        const saveRes = await apiFetch('/api/profiles/me', {
            method: 'PUT',
            body: updateData
        });

        if (saveRes.ok) {
            showToast('✅ GitHub data synced!');
            await loadUserProfile();
        }
    } catch (error) {
        showToast('❌ Failed to sync: ' + error.message, 'error');
    }
}

// ==================== TAB NAVIGATION ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.remove('bg-gray-100', 'text-gray-600');
            btn.classList.add('bg-blue-600', 'text-white');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-100', 'text-gray-600');
        }
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.remove('text-gray-400');
            btn.classList.add('text-blue-600');
        } else {
            btn.classList.remove('text-blue-600');
            btn.classList.add('text-gray-400');
        }
    });

    if (tabName === 'goals') loadGoals();
    if (tabName === 'notes') loadNotes();
}

// ==================== DASHBOARD & FUN FEATURES ====================
async function loadSummary() {
    const { userId } = getSettings();

    const homeUserId = document.getElementById('homeUserId');
    const sumIncome = document.getElementById('sum_income');
    const sumExpense = document.getElementById('sum_expense');
    const sumBalance = document.getElementById('sum_balance');
    const sumDonation = document.getElementById('sum_donation');

    if (homeUserId) homeUserId.innerText = userId;

    try {
        const res = await apiFetch(`/api/summary/${userId}`);
        if (!res.ok) return;
        const { data } = await res.json();

        if (sumIncome) sumIncome.innerText = formatRupiah(data.total_income);
        if (sumExpense) sumExpense.innerText = formatRupiah(data.total_expense);
        if (sumBalance) sumBalance.innerText = formatRupiah(data.balance);
        if (sumDonation) sumDonation.innerText = formatRupiah(data.total_donations_collected);
    } catch (e) {
        console.error('Error loading summary:', e);
    }
}

async function loadRoast() {
    const { userId } = getSettings();
    const content = document.getElementById('roastContent');
    const scoreBar = document.getElementById('roastScoreBar');
    const scoreText = document.getElementById('roastScore');

    if (content) content.innerText = 'Sedang menganalisis...';
    try {
        const res = await apiFetch(`/api/finance-roast/${userId}`);
        const { data } = await res.json();
        if (content) content.innerHTML = `<strong>${data.title}</strong><br>${data.message}`;
        if (scoreBar) scoreBar.style.width = `${data.score}%`;
        if (scoreText) scoreText.innerText = data.score;
    } catch (e) {
        if (content) content.innerText = 'Gagal memuat roast.';
    }
}

async function loadFortune() {
    const { userId } = getSettings();
    const content = document.getElementById('fortuneContent');
    if (content) content.innerText = 'Membaca bintang...';
    try {
        const res = await apiFetch(`/api/fortune/${userId}`);
        const { data } = await res.json();
        if (content) content.innerText = `"${data.fortune}" (Angka hoki: ${data.lucky_number})`;
    } catch (e) {
        if (content) content.innerText = 'Bintang sedang tidur.';
    }
}

async function checkAchievements() {
    const { userId } = getSettings();
    try {
        const res = await apiFetch(`/api/achievements/check/${userId}`, { method: 'POST' });
        const { newly_unlocked } = await res.json();
        if (newly_unlocked.length > 0) {
            showToast(`🎉 Unlock: ${newly_unlocked.join(', ')}`);
        } else {
            showToast('Belum ada achievement baru.');
        }
        loadAchievements();
    } catch (e) { console.error(e); }
}

async function loadAchievements() {
    const { userId } = getSettings();
    const list = document.getElementById('achievementsList');
    if (!list) return;

    try {
        const res = await apiFetch(`/api/achievements/${userId}`);
        const { data } = await res.json();
        if (!data.length) {
            list.innerHTML = '<p class="text-xs text-gray-400">Belum ada pencapaian. Terus bertransaksi!</p>';
            return;
        }
        list.innerHTML = data.map(a => `
            <div class="bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full border border-yellow-200">
                ${a.badge_name}
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;

    try {
        const res = await apiFetch(`/api/leaderboard/donors`);
        const { data } = await res.json();
        if (!data.length) {
            list.innerHTML = '<p class="text-xs text-gray-400">Belum ada donatur.</p>';
            return;
        }
        list.innerHTML = data.slice(0, 5).map((d, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
            return `
                <div class="flex justify-between items-center p-2 bg-gray-50 rounded-xl">
                    <span class="font-medium text-gray-700">${medal} ${d.donor_name}</span>
                    <span class="font-bold text-emerald-600 text-sm">${formatRupiah(d.total_donated)}</span>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

// ==================== BUDGET ====================
async function loadBudgets() {
    const { userId } = getSettings();
    const type = document.getElementById('filter_type')?.value || '';
    const category = document.getElementById('filter_category')?.value || '';

    let url = `/api/budgets/${userId}?`;
    if (type) url += `type=${type}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;

    try {
        const res = await apiFetch(url);
        if (!res.ok) return;
        const { data } = await res.json();
        const list = document.getElementById('budgetList');
        if (!list) return;

        if (!data.length) {
            list.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Tidak ada transaksi.</p>';
            return;
        }

        list.innerHTML = data.map(b => {
            const color = b.type === 'income' ? 'text-green-600' : 'text-red-600';
            const sign = b.type === 'income' ? '+' : '-';
            const border = b.type === 'income' ? 'border-green-500' : 'border-red-500';
            const date = new Date(b.created_at).toLocaleDateString('id-ID');
            return `
                <div class="p-4 bg-white rounded-2xl flex justify-between items-center border-l-4 ${border} shadow-sm">
                    <div>
                        <strong class="text-gray-800 block">${b.category}</strong>
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                    <div class="font-bold ${color} text-lg">${sign} ${formatRupiah(b.amount)}</div>
                </div>`;
        }).join('');
    } catch (e) { console.error(e); }
}

async function exportBudget() {
    const { userId } = getSettings();
    try {
        const res = await apiFetch(`/api/budgets/${userId}/export`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `budget_${userId}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        showToast('Export berhasil!');
    } catch (e) { showToast('Gagal export.', 'error'); }
}

// ==================== DONATION ====================
async function loadCampaigns() {
    try {
        const res = await apiFetch('/api/campaigns');
        if (!res.ok) return;
        const { data } = await res.json();
        const list = document.getElementById('campaignList');
        const select = document.getElementById('don_campaign_id');

        if (select) select.innerHTML = '<option value="">Pilih Kampanye...</option>';
        if (!list) return;

        if (!data.length) {
            list.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Belum ada kampanye.</p>';
            return;
        }

        list.innerHTML = data.map(c => {
            const progress = Math.min(100, (c.collected / c.target_amount) * 100);
            return `
                <div class="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-gray-800">${c.name}</h4>
                        <span class="text-emerald-600 font-bold text-sm">${formatRupiah(c.collected)}</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                        <div class="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                    <div class="text-xs text-gray-500 flex justify-between">
                        <span>Target: ${formatRupiah(c.target_amount)}</span>
                        <span class="font-semibold">${progress.toFixed(1)}%</span>
                    </div>
                </div>`;
        }).join('');

        if (select) {
            data.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name}</option>`);
        }
    } catch (e) { console.error(e); }
}

async function loadDonations() {
    try {
        const res = await apiFetch('/api/donations');
        if (!res.ok) return;
        const { data } = await res.json();
        const list = document.getElementById('donationList');
        if (!list) return;

        if (!data.length) {
            list.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Belum ada donasi.</p>';
            return;
        }

        list.innerHTML = data.map(d => {
            const date = new Date(d.created_at).toLocaleDateString('id-ID');
            const msg = d.message ? `<p class="text-xs italic text-gray-600 mt-1">"${d.message}"</p>` : '';
            return `
                <div class="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div class="flex justify-between items-center">
                        <strong class="text-emerald-800">${d.donor_name}</strong>
                        <span class="font-bold text-emerald-600">${formatRupiah(d.amount)}</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">untuk ${d.campaign_name} • ${date}</div>
                    ${msg}
                </div>`;
        }).join('');
    } catch (e) { console.error(e); }
}

async function submitMysteryDonation() {
    const campaignId = document.getElementById('don_campaign_id')?.value;
    const donorName = document.getElementById('don_name')?.value;
    const baseAmount = parseFloat(document.getElementById('don_amount')?.value || '0');
    const message = document.getElementById('don_message')?.value;

    if (!campaignId || !donorName || !baseAmount) {
        showToast('Lengkapi data donasi dulu!', 'error');
        return;
    }

    const data = { donor_name: donorName, campaign_id: parseInt(campaignId), base_amount: baseAmount, message };
    try {
        const res = await apiFetch('/api/donations/mystery', { method: 'POST', body: data });
        if (res.ok) {
            const result = await res.json();
            document.getElementById('donationForm')?.reset();
            const formatted = document.getElementById('don_amount_formatted');
            if (formatted) formatted.value = '';
            loadDonations();
            loadCampaigns();
            loadSummary();
            showToast(`🎰 ${result.message} Total: ${formatRupiah(result.data.final_amount)}`);
        }
    } catch (err) { showToast('Gagal gacha donasi.', 'error'); }
}

async function exportDonations() {
    try {
        const res = await apiFetch('/api/donations/export');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'donations.csv';
        document.body.appendChild(a); a.click(); a.remove();
        showToast('Export berhasil!');
    } catch (e) { showToast('Gagal export.', 'error'); }
}

// ==================== GOALS ====================
async function loadGoals() {
    const { userId } = getSettings();
    const list = document.getElementById('goalsList');
    if (!list) return;

    try {
        const res = await apiFetch(`/api/goals/${userId}`);
        const { data } = await res.json();
        if (!data.length) {
            list.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Belum ada target tabungan.</p>';
            return;
        }

        list.innerHTML = data.map(g => {
            const progress = Math.min(100, (g.current_amount / g.target_amount) * 100);
            const isCompleted = g.is_completed === true || g.is_completed === 1;
            return `
                <div class="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 ${isCompleted ? 'bg-indigo-50 border-indigo-200' : ''}">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-gray-800">${g.name} ${isCompleted ? '🏆' : ''}</h4>
                        <span class="text-indigo-600 font-bold text-sm">${formatRupiah(g.current_amount)}</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-2.5 mb-3">
                        <div class="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-gray-500">Target: ${formatRupiah(g.target_amount)}</span>
                        ${!isCompleted ? `<button onclick="openContributeModal(${g.id})" class="text-xs bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-200 transition font-semibold active:scale-95">+ Tabung</button>` : '<span class="text-xs font-bold text-green-600">Tercapai!</span>'}
                    </div>
                </div>`;
        }).join('');
    } catch (e) { console.error(e); }
}

function openContributeModal(goalId) {
    currentGoalId = goalId;
    const formatted = document.getElementById('contributeAmountFormatted');
    const hidden = document.getElementById('contributeAmount');
    if (formatted) formatted.value = '';
    if (hidden) hidden.value = '';

    const modal = document.getElementById('contributeModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeContributeModal() {
    const modal = document.getElementById('contributeModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function submitContribution() {
    const amount = parseFloat(document.getElementById('contributeAmount')?.value || '0');
    if (!amount || amount <= 0) {
        showToast('Masukkan nominal yang valid!', 'error');
        return;
    }
    try {
        const res = await apiFetch(`/api/goals/${currentGoalId}/contribute`, { method: 'POST', body: { amount } });
        if (res.ok) {
            const { data } = await res.json();
            closeContributeModal();
            loadGoals();
            showToast(data.is_completed ? '🎉 Target tabungan tercapai!' : 'Tabungan ditambahkan!');
        }
    } catch (err) { showToast('Gagal menabung.', 'error'); }
}

// ==================== NOTES ====================
function openNoteModal(note = null) {
    const titleEl = document.getElementById('noteModalTitle');
    const idEl = document.getElementById('noteId');
    const noteTitleEl = document.getElementById('noteTitle');
    const noteContentEl = document.getElementById('noteContent');
    const notePinnedEl = document.getElementById('notePinned');
    const deleteBtn = document.getElementById('deleteNoteBtn');

    if (titleEl) titleEl.innerText = note ? 'Edit Catatan' : 'Catatan Baru';
    if (idEl) idEl.value = note?.id || '';
    if (noteTitleEl) noteTitleEl.value = note?.title || '';
    if (noteContentEl) noteContentEl.value = note?.content || '';
    if (notePinnedEl) notePinnedEl.checked = note?.is_pinned || false;
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !note);

    selectedNoteColor = note?.color || 'white';
    updateColorButtons();

    const modal = document.getElementById('noteModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeNoteModal() {
    const modal = document.getElementById('noteModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function selectNoteColor(color) {
    selectedNoteColor = color;
    updateColorButtons();
}

function updateColorButtons() {
    document.querySelectorAll('.color-btn').forEach(btn => {
        if (btn.dataset.color === selectedNoteColor) {
            btn.classList.add('border-gray-800', 'scale-110');
            btn.classList.remove('border-transparent');
        } else {
            btn.classList.remove('border-gray-800', 'scale-110');
            btn.classList.add('border-transparent');
        }
    });
}

async function saveNote() {
    const { userId } = getSettings();
    const noteId = document.getElementById('noteId')?.value;
    const data = {
        user_id: userId,
        title: document.getElementById('noteTitle')?.value,
        content: document.getElementById('noteContent')?.value,
        color: selectedNoteColor,
        is_pinned: document.getElementById('notePinned')?.checked
    };

    if (!data.title) {
        showToast('Judul tidak boleh kosong!', 'error');
        return;
    }

    try {
        let res;
        if (noteId) {
            res = await apiFetch(`/api/notes/${noteId}`, { method: 'PUT', body: data });
        } else {
            res = await apiFetch('/api/notes', { method: 'POST', body: data });
        }

        if (res.ok) {
            closeNoteModal();
            loadNotes();
            showToast(noteId ? 'Catatan diupdate!' : 'Catatan dibuat!');
        }
    } catch (err) {
        showToast('Gagal menyimpan catatan.', 'error');
    }
}

async function deleteNote() {
    const noteId = document.getElementById('noteId')?.value;
    if (!noteId) return;

    if (!confirm('Yakin ingin menghapus catatan ini?')) return;

    try {
        const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
        if (res.ok) {
            closeNoteModal();
            loadNotes();
            showToast('Catatan dihapus!');
        }
    } catch (err) {
        showToast('Gagal menghapus catatan.', 'error');
    }
}

async function loadNotes() {
    const { userId } = getSettings();
    const list = document.getElementById('notesList');
    if (!list) return;

    try {
        const res = await apiFetch(`/api/notes/${userId}`);
        const { data } = await res.json();

        if (!data.length) {
            list.innerHTML = '<p class="text-gray-400 text-center py-8 text-sm col-span-full">Belum ada catatan. Klik "+ Catatan Baru" untuk mulai!</p>';
            return;
        }

        const colorClasses = {
            white: 'bg-white',
            yellow: 'bg-yellow-100',
            green: 'bg-green-100',
            blue: 'bg-blue-100',
            pink: 'bg-pink-100'
        };

        list.innerHTML = data.map(n => {
            const colorClass = colorClasses[n.color] || 'bg-white';
            const date = new Date(n.updated_at || n.created_at).toLocaleDateString('id-ID');
            const safeNote = JSON.stringify(n).replace(/'/g, "\\'");
            return `
                <div class="p-5 rounded-2xl shadow-sm border border-gray-200 ${colorClass} cursor-pointer hover:shadow-md transition" onclick='openNoteModal(${safeNote})'>
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-gray-800 text-lg">${n.title}</h4>
                        ${n.is_pinned ? '<span class="text-lg">📌</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-600 line-clamp-3 mb-3">${n.content || '<em class="text-gray-400">Tidak ada isi</em>'}</p>
                    <div class="text-xs text-gray-400">${date}</div>
                </div>`;
        }).join('');
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p class="text-red-500 text-center py-8 text-sm col-span-full">Gagal memuat catatan.</p>';
    }
}

// ==================== DEBOUNCE ====================
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const debouncedLoadBudgets = debounce(loadBudgets, 500);

// ==================== LOGIN FUNCTIONS ====================
function quickLogin() {
    const userId = document.getElementById('quickUserId')?.value.trim() || 'user_demo';
    localStorage.setItem('userId', userId);
    localStorage.setItem('apiKey', 'secret_something_aman');
    window.location.href = '/index.html';
}

async function loginWithGitHub() {
    if (!window.authClient) {
        alert('Auth client not loaded!');
        return;
    }

    try {
        await window.authClient.signIn.social({
            provider: "github",
            callbackURL: window.location.origin + '/index.html',
        });
    } catch (error) {
        console.error('GitHub sign-in error:', error);
        alert('Gagal login dengan GitHub: ' + error.message);
    }
}

// ==================== INITIALIZATION ====================
function initApp() {
    const { userId } = getSettings();
    if (!userId) {
        window.location.href = '/login.html';
        return;
    }

    loadUserProfile().then(() => {
        const budgetAmount = document.getElementById('budget_amount_formatted');
        const campTarget = document.getElementById('camp_target_formatted');
        const donAmount = document.getElementById('don_amount_formatted');
        const goalTarget = document.getElementById('goal_target_formatted');
        const contributeAmount = document.getElementById('contributeAmountFormatted');

        if (budgetAmount) formatCurrencyInput(budgetAmount);
        if (campTarget) formatCurrencyInput(campTarget);
        if (donAmount) formatCurrencyInput(donAmount);
        if (goalTarget) formatCurrencyInput(goalTarget);
        if (contributeAmount) formatCurrencyInput(contributeAmount);

        loadSummary();
        loadBudgets();
        loadCampaigns();
        loadDonations();
        loadRoast();
        loadFortune();
        loadAchievements();
        loadLeaderboard();
        loadGoals();
        loadNotes();

        switchTab('home');
    });
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    // Budget form
    const budgetForm = document.getElementById('budgetForm');
    if (budgetForm) {
        budgetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { userId } = getSettings();
            const data = {
                user_id: userId,
                category: document.getElementById('budget_category')?.value,
                amount: parseFloat(document.getElementById('budget_amount')?.value || '0'),
                type: document.getElementById('budget_type')?.value
            };

            try {
                const res = await apiFetch('/api/budgets', { method: 'POST', body: data });
                if (res.ok) {
                    e.target.reset();
                    const formatted = document.getElementById('budget_amount_formatted');
                    if (formatted) formatted.value = '';
                    loadBudgets();
                    loadSummary();
                    showToast('Transaksi disimpan!');
                }
            } catch (err) { showToast('Gagal menyimpan.', 'error'); }
        });
    }

    // Campaign form
    const campaignForm = document.getElementById('campaignForm');
    if (campaignForm) {
        campaignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('camp_name')?.value,
                description: document.getElementById('camp_desc')?.value,
                target_amount: parseFloat(document.getElementById('camp_target')?.value || '0')
            };

            try {
                const res = await apiFetch('/api/campaigns', { method: 'POST', body: data });
                if (res.status === 409) { showToast('Nama kampanye sudah ada!', 'error'); return; }
                if (res.ok) {
                    e.target.reset();
                    const formatted = document.getElementById('camp_target_formatted');
                    if (formatted) formatted.value = '';
                    loadCampaigns();
                    showToast('Kampanye dibuat!');
                }
            } catch (err) { showToast('Gagal membuat kampanye.', 'error'); }
        });
    }

    // Donation form
    const donationForm = document.getElementById('donationForm');
    if (donationForm) {
        donationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                donor_name: document.getElementById('don_name')?.value,
                campaign_id: parseInt(document.getElementById('don_campaign_id')?.value || '0'),
                amount: parseFloat(document.getElementById('don_amount')?.value || '0'),
                message: document.getElementById('don_message')?.value
            };

            try {
                const res = await apiFetch('/api/donations', { method: 'POST', body: data });
                if (res.ok) {
                    e.target.reset();
                    const formatted = document.getElementById('don_amount_formatted');
                    if (formatted) formatted.value = '';
                    loadDonations();
                    loadCampaigns();
                    loadSummary();
                    showToast('Terima kasih atas donasinya! ❤️');
                }
            } catch (err) { showToast('Gagal mengirim donasi.', 'error'); }
        });
    }

    // Goal form
    const goalForm = document.getElementById('goalForm');
    if (goalForm) {
        goalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { userId } = getSettings();
            const data = {
                user_id: userId,
                name: document.getElementById('goal_name')?.value,
                target_amount: parseFloat(document.getElementById('goal_target')?.value || '0')
            };
            try {
                const res = await apiFetch('/api/goals', { method: 'POST', body: data });
                if (res.ok) {
                    e.target.reset();
                    const formatted = document.getElementById('goal_target_formatted');
                    if (formatted) formatted.value = '';
                    loadGoals();
                    showToast('Target dibuat!');
                }
            } catch (err) { showToast('Gagal membuat target.', 'error'); }
        });
    }

    // Edit profile form
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const { userId } = getSettings();
            const data = {
                user_id: userId,
                username: document.getElementById('edit_username')?.value.trim() || null,
                display_name: document.getElementById('edit_display_name')?.value.trim(),
                bio: document.getElementById('edit_bio')?.value.trim(),
                github_username: document.getElementById('edit_github')?.value.trim() || null,
                location: document.getElementById('edit_location')?.value.trim(),
                avatar_url: document.getElementById('avatarPreview')?.src,
                banner_url: document.getElementById('bannerPreview')?.src,
                socials: {
                    twitter: document.getElementById('edit_twitter')?.value.trim(),
                    website: document.getElementById('edit_website')?.value.trim(),
                    github: document.getElementById('edit_github')?.value.trim(),
                }
            };

            try {
                const res = await apiFetch('/api/profiles/me', {
                    method: 'PUT',
                    body: data
                });

                if (res.status === 409) {
                    showToast('Username sudah dipakai!', 'error');
                    return;
                }

                if (res.ok) {
                    showToast('✅ Profile updated!');
                    closeEditProfile();
                    await loadUserProfile();
                }
            } catch (error) {
                showToast('❌ Failed to save: ' + error.message, 'error');
            }
        });
    }

    // Username check (live)
    const usernameInput = document.getElementById('edit_username');
    if (usernameInput) {
        let timeout;
        usernameInput.addEventListener('input', (e) => {
            const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            e.target.value = value;

            clearTimeout(timeout);
            const statusEl = document.getElementById('usernameStatus');
            if (value.length < 3) {
                if (statusEl) statusEl.innerHTML = '';
                return;
            }

            timeout = setTimeout(async () => {
                if (statusEl) statusEl.innerHTML = '<span class="text-gray-400">⏳ Checking...</span>';

                try {
                    const { userId } = getSettings();
                    const res = await apiFetch(`/api/profiles/check-username/${value}?current_user_id=${userId}`);
                    const { data } = await res.json();

                    if (data.available) {
                        if (statusEl) statusEl.innerHTML = '<span class="text-green-600">✓ Available</span>';
                    } else {
                        if (statusEl) statusEl.innerHTML = '<span class="text-red-600">✗ Taken</span>';
                    }
                } catch {
                    if (statusEl) statusEl.innerHTML = '<span class="text-gray-400">⚠️ Error</span>';
                }
            }, 500);
        });
    }

    // Filter change listeners
    const filterType = document.getElementById('filter_type');
    if (filterType) filterType.addEventListener('change', loadBudgets);

    const filterStart = document.getElementById('filter_start');
    if (filterStart) filterStart.addEventListener('change', loadBudgets);

    const filterEnd = document.getElementById('filter_end');
    if (filterEnd) filterEnd.addEventListener('change', loadBudgets);

    // Initialize app
    initApp();
});

// ==================== GLOBAL FUNCTION EXPORTS (PALING BAWAH!) ====================
window.toggleProfileMenu = toggleProfileMenu;
window.viewMyProfile = viewMyProfile;
window.openEditProfile = openEditProfile;
window.closeEditProfile = closeEditProfile;
window.syncGitHub = syncGitHub;
window.fetchFromGitHub = fetchFromGitHub;
window.closePublicProfile = closePublicProfile;
window.logout = logout;
window.switchTab = switchTab;
window.loadRoast = loadRoast;
window.loadFortune = loadFortune;
window.checkAchievements = checkAchievements;
window.exportBudget = exportBudget;
window.exportDonations = exportDonations;
window.submitMysteryDonation = submitMysteryDonation;
window.openContributeModal = openContributeModal;
window.closeContributeModal = closeContributeModal;
window.submitContribution = submitContribution;
window.openNoteModal = openNoteModal;
window.closeNoteModal = closeNoteModal;
window.selectNoteColor = selectNoteColor;
window.saveNote = saveNote;
window.deleteNote = deleteNote;
window.quickLogin = quickLogin;
window.loginWithGitHub = loginWithGitHub;