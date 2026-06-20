import { neon } from '@neondatabase/serverless';
import type { PagesFunction } from '@cloudflare/workers-types';

export interface Env {
    NEON_DATABASE_URL: string;
    API_KEY: string;
}

// ==================== REQUEST BODY INTERFACES ====================
interface BudgetRequest {
    user_id: string;
    category: string;
    amount: number;
    type: 'income' | 'expense';
}

interface CampaignRequest {
    name: string;
    description?: string;
    target_amount: number;
}

interface DonationRequest {
    donor_name: string;
    campaign_id: number;
    amount: number;
    message?: string;
}

interface MysteryDonationRequest {
    donor_name: string;
    campaign_id: number;
    base_amount: number;
    message?: string;
}

interface GoalRequest {
    user_id: string;
    name: string;
    target_amount: number;
}

interface ContributeRequest {
    amount: number;
}

interface NoteRequest {
    user_id: string;
    title: string;
    content?: string;
    color?: string;
    is_pinned?: boolean;
}

// TAMBAHKAN INI ↓
interface ProfileRequest {
    user_id: string;
    username?: string;
    display_name?: string;
    bio?: string;
    github_username?: string;
    location?: string;
    socials?: Record<string, string>;
    avatar_url?: string;
    banner_url?: string;
}

interface GitHubUserResponse {
    avatar_url: string;
    bio: string | null;
    name: string | null;
    location: string | null;
    blog: string | null;
    twitter_username: string | null;
    public_repos: number;
    followers: number;
    following: number;
    created_at: string;
    html_url: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, params } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', '');
    const method = request.method;

    const sql = neon(env.NEON_DATABASE_URL);

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    };

    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (!path.startsWith('/auth')) {
        const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('key');
        if (apiKey !== env.API_KEY) {
            return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
    }

    try {
        // ==================== SUMMARY ====================
        if (path.match(/^\/summary\/.+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const [income, expense, donations] = await Promise.all([
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM budgets WHERE user_id = ${userId} AND type = 'income'`,
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM budgets WHERE user_id = ${userId} AND type = 'expense'`,
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM donations`,
            ]);

            return Response.json({
                data: {
                    total_income: Number(income[0].total),
                    total_expense: Number(expense[0].total),
                    balance: Number(income[0].total) - Number(expense[0].total),
                    total_donations_collected: Number(donations[0].total),
                },
            }, { headers: corsHeaders });
        }

        // ==================== PROFILES ====================

        // GET /api/profiles/me - Ambil profile user yang login
        if (path === '/profiles/me' && method === 'GET') {
            const userId = url.searchParams.get('user_id');
            if (!userId) return Response.json({ error: 'user_id required' }, { status: 400, headers: corsHeaders });

            let profile = await sql`SELECT * FROM profiles WHERE user_id = ${userId}`;

            // Auto-create profile kalau belum ada
            if (!profile.length) {
                profile = await sql`
      INSERT INTO profiles (user_id, display_name, avatar_url)
      VALUES (${userId}, ${userId}, ${`https://ui-avatars.com/api/?name=${userId}&background=8b5cf6&color=fff`})
      RETURNING *
    `;
            }

            return Response.json({ data: profile[0] }, { headers: corsHeaders });
        }

        // GET /api/profiles/:username - Public profile
        if (path.match(/^\/profiles\/[^\/]+$/) && method === 'GET' && !path.includes('/me')) {
            const username = path.split('/')[2];
            const profile = await sql`
    SELECT id, user_id, username, display_name, bio, avatar_url, banner_url,
           github_username, location, socials, donation_streak, total_donations,
           is_verified, role, created_at
    FROM profiles 
    WHERE username = ${username} OR user_id = ${username}
  `;

            if (!profile.length) {
                return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders });
            }

            return Response.json({ data: profile[0] }, { headers: corsHeaders });
        }

        // PUT /api/profiles/me - Update profile
        if (path === '/profiles/me' && method === 'PUT') {
            const body = await request.json() as ProfileRequest;
            const { user_id, username, display_name, bio, github_username, location, socials, avatar_url, banner_url } = body;

            if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400, headers: corsHeaders });

            try {
                const updated = await sql`
      UPDATE profiles SET
        username = COALESCE(${username}, username),
        display_name = COALESCE(${display_name}, display_name),
        bio = COALESCE(${bio}, bio),
        github_username = COALESCE(${github_username}, github_username),
        location = COALESCE(${location}, location),
        socials = COALESCE(${JSON.stringify(socials || {})}::jsonb, socials),
        avatar_url = COALESCE(${avatar_url}, avatar_url),  -- ✅ Ini penting!
        banner_url = COALESCE(${banner_url}, banner_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${user_id}
      RETURNING *
    `;
                return Response.json({ data: updated[0] }, { headers: corsHeaders });
            } catch (e: any) {
                if (e.message?.includes('unique constraint') || e.message?.includes('duplicate key')) {
                    return Response.json({ error: 'Username sudah dipakai!' }, { status: 409, headers: corsHeaders });
                }
                throw e;
            }
        }

        // GET /api/profiles/check-username/:username
        if (path.match(/^\/profiles\/check-username\/[^\/]+$/) && method === 'GET') {
            const username = path.split('/')[3];
            const currentUserId = url.searchParams.get('current_user_id');

            const existing = await sql`
    SELECT user_id FROM profiles WHERE username = ${username}
  `;

            const isAvailable = existing.length === 0 || existing[0].user_id === currentUserId;
            return Response.json({ data: { available: isAvailable } }, { headers: corsHeaders });
        }

        // GET /api/profiles/github/:username - Fetch real data from GitHub
        if (path.match(/^\/profiles\/github\/[^\/]+$/) && method === 'GET') {
            const githubUsername = path.split('/')[3];

            try {
                const githubRes = await fetch(`https://api.github.com/users/${githubUsername}`, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'FinShare-App'
                    }
                });

                if (!githubRes.ok) {
                    return Response.json({ error: 'GitHub user not found' }, { status: 404, headers: corsHeaders });
                }

                const githubData = await githubRes.json() as GitHubUserResponse;

                return Response.json({
                    data: {
                        avatar_url: githubData.avatar_url,
                        bio: githubData.bio,
                        name: githubData.name,
                        location: githubData.location,
                        blog: githubData.blog,
                        twitter_username: githubData.twitter_username,
                        public_repos: githubData.public_repos,
                        followers: githubData.followers,
                        following: githubData.following,
                        created_at: githubData.created_at,
                        html_url: githubData.html_url,
                    }
                }, { headers: corsHeaders });
            } catch (error: any) {
                return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
            }
        }

        // GET /api/profiles/me/activity - Contribution graph data
        if (path === '/profiles/me/activity' && method === 'GET') {
            const userId = url.searchParams.get('user_id');

            const activity = await sql`
    SELECT donation_date, amount, count
    FROM donation_activity
    WHERE user_id = ${userId}
      AND donation_date >= CURRENT_DATE - INTERVAL '365 days'
    ORDER BY donation_date ASC
  `;

            return Response.json({ data: activity }, { headers: corsHeaders });
        }

        // POST /api/donations - Update untuk track activity
        // (Tambah ini di bagian donations POST yang sudah ada)
        // Setelah INSERT INTO donations, tambahkan:
        /*
          // Track activity untuk contribution graph
          await sql`
            INSERT INTO donation_activity (user_id, donation_date, amount, count)
            VALUES (${donor_name}, CURRENT_DATE, ${amount}, 1)
            ON CONFLICT (user_id, donation_date) 
            DO UPDATE SET 
              amount = donation_activity.amount + ${amount},
              count = donation_activity.count + 1
          `;
        */

        // ==================== BUDGETS ====================
        if (path.match(/^\/budgets\/.+$/) && method === 'GET' && !path.includes('/export')) {
            const userId = path.split('/')[2];
            const { searchParams } = url;
            const type = searchParams.get('type');
            const category = searchParams.get('category');

            let query = `SELECT * FROM budgets WHERE user_id = '${userId}'`;

            if (type) query += ` AND type = '${type}'`;
            if (category) query += ` AND category ILIKE '%${category}%'`;

            query += ` ORDER BY created_at DESC`;
            const results = await sql.unsafe(query);

            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path === '/budgets' && method === 'POST') {
            const body = await request.json() as BudgetRequest;
            const { user_id, category, amount, type } = body;

            await sql`
        INSERT INTO budgets (user_id, category, amount, type) 
        VALUES (${user_id}, ${category}, ${amount}, ${type})
      `;
            return Response.json({ message: 'Success' }, { status: 201, headers: corsHeaders });
        }

        if (path.match(/^\/budgets\/.+\/export$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const results = await sql`
        SELECT user_id, category, amount, type, created_at
        FROM budgets WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

            if (!results.length) {
                return new Response('No data', {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'text/csv' }
                });
            }

            const headers = ['user_id', 'category', 'amount', 'type', 'created_at'];
            const rows = results.map((r: any) =>
                headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(',')
            );
            const csv = [headers.join(','), ...rows].join('\n');

            return new Response(csv, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="budget_${userId}.csv"`
                }
            });
        }

        // ==================== CAMPAIGNS ====================
        if (path === '/campaigns' && method === 'GET') {
            const results = await sql`
        SELECT c.*, COALESCE(SUM(d.amount), 0) as collected
        FROM campaigns c
        LEFT JOIN donations d ON c.id = d.campaign_id
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path === '/campaigns' && method === 'POST') {
            const body = await request.json() as CampaignRequest;
            const { name, description, target_amount } = body;

            try {
                await sql`
          INSERT INTO campaigns (name, description, target_amount, is_active)
          VALUES (${name}, ${description || ''}, ${target_amount}, true)
        `;
                return Response.json({ message: 'Campaign created' }, { status: 201, headers: corsHeaders });
            } catch (e: any) {
                if (e.message?.includes('unique constraint')) {
                    return Response.json({ error: 'Campaign name already exists' }, { status: 409, headers: corsHeaders });
                }
                throw e;
            }
        }

        // ==================== DONATIONS ====================
        if (path === '/donations' && method === 'POST') {
            const body = await request.json() as DonationRequest;
            const { donor_name, campaign_id, amount, message } = body;

            const campaign = await sql`SELECT id FROM campaigns WHERE id = ${campaign_id} AND is_active = true`;
            if (!campaign.length) {
                return Response.json({ error: 'Invalid or inactive campaign' }, { status: 400, headers: corsHeaders });
            }

            await sql`
        INSERT INTO donations (donor_name, campaign_id, amount, message)
        VALUES (${donor_name}, ${campaign_id}, ${amount}, ${message || ''})
      `;
            return Response.json({ message: 'Success' }, { status: 201, headers: corsHeaders });
        }

        if (path === '/donations' && method === 'GET') {
            const results = await sql`
        SELECT d.*, c.name as campaign_name
        FROM donations d
        JOIN campaigns c ON d.campaign_id = c.id
        ORDER BY d.created_at DESC
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path === '/donations/mystery' && method === 'POST') {
            const body = await request.json() as MysteryDonationRequest;
            const { donor_name, campaign_id, base_amount, message } = body;

            const campaign = await sql`SELECT id FROM campaigns WHERE id = ${campaign_id} AND is_active = true`;
            if (!campaign.length) {
                return Response.json({ error: 'Invalid or inactive campaign' }, { status: 400, headers: corsHeaders });
            }

            const multiplier = Math.floor(Math.random() * 5) + 1;
            const final_amount = Number(base_amount) * multiplier;

            await sql`
        INSERT INTO donations (donor_name, campaign_id, amount, message)
        VALUES (${donor_name}, ${campaign_id}, ${final_amount}, ${`[MYSTERY x${multiplier}] ${message || ''}`})
      `;

            return Response.json({
                message: `You got a ${multiplier}x multiplier!`,
                data: { base_amount, multiplier, final_amount },
            }, { status: 201, headers: corsHeaders });
        }

        if (path === '/donations/export' && method === 'GET') {
            const results = await sql`
        SELECT d.donor_name, c.name as campaign_name, d.amount, d.message, d.created_at
        FROM donations d
        JOIN campaigns c ON d.campaign_id = c.id
        ORDER BY d.created_at DESC
      `;

            if (!results.length) {
                return new Response('No data', {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'text/csv' }
                });
            }

            const headers = ['donor_name', 'campaign_name', 'amount', 'message', 'created_at'];
            const rows = results.map((r: any) =>
                headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
            );
            const csv = [headers.join(','), ...rows].join('\n');

            return new Response(csv, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="donations.csv"'
                }
            });
        }

        // ==================== GOALS ====================
        if (path.match(/^\/goals\/[^\/]+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const results = await sql`
        SELECT * FROM goals WHERE user_id = ${userId} ORDER BY created_at DESC
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path === '/goals' && method === 'POST') {
            const body = await request.json() as GoalRequest;
            const { user_id, name, target_amount } = body;

            await sql`
        INSERT INTO goals (user_id, name, target_amount)
        VALUES (${user_id}, ${name}, ${target_amount})
      `;
            return Response.json({ message: 'Goal created' }, { status: 201, headers: corsHeaders });
        }

        if (path.match(/^\/goals\/\d+\/contribute$/) && method === 'POST') {
            const goalId = path.split('/')[2];
            const body = await request.json() as ContributeRequest;
            const { amount } = body;

            const goal = await sql`SELECT * FROM goals WHERE id = ${goalId}`;
            if (!goal.length) {
                return Response.json({ error: 'Goal not found' }, { status: 404, headers: corsHeaders });
            }

            const newAmount = Number(goal[0].current_amount) + Number(amount);
            const isCompleted = newAmount >= Number(goal[0].target_amount);

            await sql`
        UPDATE goals 
        SET current_amount = ${newAmount}, is_completed = ${isCompleted}
        WHERE id = ${goalId}
      `;

            return Response.json({
                message: 'Contribution added',
                data: { current_amount: newAmount, is_completed: isCompleted },
            }, { headers: corsHeaders });
        }

        // ==================== NOTES ====================
        if (path.match(/^\/notes\/[^\/]+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const results = await sql`
        SELECT * FROM notes WHERE user_id = ${userId}
        ORDER BY is_pinned DESC, updated_at DESC
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path === '/notes' && method === 'POST') {
            const body = await request.json() as NoteRequest;
            const { user_id, title, content, color, is_pinned } = body;

            await sql`
        INSERT INTO notes (user_id, title, content, color, is_pinned)
        VALUES (${user_id}, ${title}, ${content || ''}, ${color || 'white'}, ${is_pinned || false})
      `;
            return Response.json({ message: 'Note created' }, { status: 201, headers: corsHeaders });
        }

        if (path.match(/^\/notes\/\d+$/) && method === 'PUT') {
            const noteId = path.split('/')[2];
            const body = await request.json() as NoteRequest;
            const { title, content, color, is_pinned } = body;

            await sql`
        UPDATE notes
        SET title = ${title}, content = ${content}, color = ${color}, 
            is_pinned = ${is_pinned || false}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${noteId}
      `;
            return Response.json({ message: 'Note updated' }, { headers: corsHeaders });
        }

        if (path.match(/^\/notes\/\d+$/) && method === 'DELETE') {
            const noteId = path.split('/')[2];
            await sql`DELETE FROM notes WHERE id = ${noteId}`;
            return Response.json({ message: 'Note deleted' }, { headers: corsHeaders });
        }

        // ==================== ACHIEVEMENTS ====================
        if (path.match(/^\/achievements\/[^\/]+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const results = await sql`
        SELECT * FROM achievements WHERE user_id = ${userId} ORDER BY unlocked_at DESC
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        if (path.match(/^\/achievements\/check\/[^\/]+$/) && method === 'POST') {
            const userId = path.split('/')[3];
            const unlockedBadges: string[] = [];

            const existing = await sql`SELECT badge_code FROM achievements WHERE user_id = ${userId}`;
            const existingCodes = new Set(existing.map((r: any) => r.badge_code));

            const tryUnlock = async (code: string, name: string, condition: boolean) => {
                if (condition && !existingCodes.has(code)) {
                    await sql`
            INSERT INTO achievements (user_id, badge_code, badge_name)
            VALUES (${userId}, ${code}, ${name})
          `;
                    unlockedBadges.push(name);
                    existingCodes.add(code);
                }
            };

            const budgetCount = await sql`SELECT COUNT(*) as count FROM budgets WHERE user_id = ${userId}`;
            await tryUnlock('FIRST_BUDGET', 'First Step 🐣', Number(budgetCount[0].count) > 0);

            const donationCount = await sql`SELECT COUNT(*) as count FROM donations WHERE donor_name = ${userId}`;
            await tryUnlock('FIRST_DONATION', 'Generous Heart ❤️', Number(donationCount[0].count) > 0);

            const totalDonated = await sql`SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE donor_name = ${userId}`;
            await tryUnlock('WHALE', 'Crypto Whale 🐋', Number(totalDonated[0].total) >= 1000);

            const completedGoals = await sql`SELECT COUNT(*) as count FROM goals WHERE user_id = ${userId} AND is_completed = true`;
            await tryUnlock('GOAL_CRUSHER', 'Goal Crusher 🏆', Number(completedGoals[0].count) > 0);

            await tryUnlock('CENTURION', 'Centurion 💯', Number(budgetCount[0].count) >= 100);

            return Response.json({ message: 'Achievement check complete', newly_unlocked: unlockedBadges }, { headers: corsHeaders });
        }

        // ==================== LEADERBOARD ====================
        if (path === '/leaderboard/donors' && method === 'GET') {
            const results = await sql`
        SELECT donor_name, SUM(amount) as total_donated, COUNT(id) as donation_count
        FROM donations
        GROUP BY donor_name
        ORDER BY total_donated DESC
        LIMIT 10
      `;
            return Response.json({ data: results }, { headers: corsHeaders });
        }

        // ==================== FINANCE ROAST ====================
        if (path.match(/^\/finance-roast\/[^\/]+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const [income, expense, donations] = await Promise.all([
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM budgets WHERE user_id = ${userId} AND type = 'income'`,
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM budgets WHERE user_id = ${userId} AND type = 'expense'`,
                sql`SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE donor_name = ${userId}`,
            ]);

            const inc = Number(income[0].total);
            const exp = Number(expense[0].total);
            const don = Number(donations[0].total);

            let score = 50, title = 'Financial Novice', message = '';

            if (inc > 0) {
                const savingsRate = ((inc - exp) / inc) * 100;
                const generosityRate = (don / inc) * 100;

                score += Math.min(savingsRate, 40);
                score += Math.min(generosityRate * 2, 30);

                if (exp > inc) {
                    score -= 30;
                    title = 'Walking Red Flag 🚩';
                    message = "Bro, you're spending more than you make.";
                } else if (savingsRate >= 30 && generosityRate > 5) {
                    title = 'Financial God 🌟';
                    message = "Okay, Elon Musk. You're saving AND giving back?";
                } else if (savingsRate >= 20) {
                    title = 'Savvy Saver 💰';
                    message = "Look at you, hoarding cash like a dragon.";
                } else if (generosityRate > 10) {
                    title = 'Big Heart ❤️‍🩹';
                    message = "You give so much, but who takes care of YOU?";
                } else {
                    title = 'Average Joe 📊';
                    message = "You're surviving. Maybe set a budget?";
                }
            } else {
                title = 'Ghost 👻';
                message = 'No income recorded?';
                score = 0;
            }

            score = Math.max(0, Math.min(100, Math.round(score)));
            return Response.json({ data: { score, title, message } }, { headers: corsHeaders });
        }

        // ==================== FORTUNE ====================
        if (path.match(/^\/fortune\/[^\/]+$/) && method === 'GET') {
            const userId = path.split('/')[2];
            const topExpense = await sql`
        SELECT category FROM budgets
        WHERE user_id = ${userId} AND type = 'expense'
        GROUP BY category
        ORDER BY SUM(amount) DESC
        LIMIT 1
      `;

            const fortunes = [
                "A surprising windfall is coming, but only if you stop buying {category}.",
                "The stars say you will achieve freedom, but {category} is blocking your chi.",
                "Beware of false prophets, especially if they involve {category}.",
                "Your spirit animal is a squirrel. Save more nuts, less {category}.",
                "An old friend will ask to borrow money for {category}. Say no.",
            ];

            const category = topExpense[0]?.category || 'unnecessary things';
            const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)].replace('{category}', category);

            return Response.json({
                data: {
                    fortune: randomFortune,
                    lucky_number: Math.floor(Math.random() * 100) + 1,
                    unlucky_category: category,
                },
            }, { headers: corsHeaders });
        }

        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    } catch (error: any) {
        console.error('API Error:', error);
        return Response.json({ error: error.message || 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
};