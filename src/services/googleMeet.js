const CLIENT_ID = import.meta.env.VITE_GOOGLE_MEET_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_MEET_CLIENT_SECRET;
//Email: id-60pipe@fine-iterator-495014-v2.iam.gserviceaccount.com
//Unique ID : 112192993275569645474
/**
 * Service to handle Google Meet API interactions
 */
class GoogleMeetService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.currentUser = null;
  }

  /**
   * Fetch current user info (email and ID)
   */
  async getCurrentUser(token) {
    if (this.currentUser) return this.currentUser;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        this.currentUser = await res.json();
        return this.currentUser;
      }
    } catch (e) {
      console.error("[Q4Magic] Error getting userinfo:", e);
    }
    return null;
  }

  /**
   * Simple OAuth 2.0 flow for Chrome Extension
   * Note: For production, use chrome.identity.getAuthToken with manifest.json config
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const scopes = [
      'https://www.googleapis.com/auth/meetings.space.readonly',
      'https://www.googleapis.com/auth/meetings.space.created',
      'https://www.googleapis.com/auth/directory.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/user.emails.read',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];
    const scopeParam = encodeURIComponent(scopes.join(' '));
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&scope=${scopeParam}&prompt=consent&access_type=offline`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          return reject(chrome.runtime.lastError || new Error('Auth failed'));
        }

        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');

        // Exchange code for token
        try {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code'
            })
          });

          const data = await tokenResponse.json();
          this.accessToken = data.access_token;
          this.tokenExpiry = Date.now() + (data.expires_in * 1000);
          resolve(this.accessToken);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Fetch the meeting owner/organizer via Calendar API
   */
  async fetchMeetingOwner(meetingCode, token) {
    try {
      // Search for the calendar event matching the meeting code
      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${meetingCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (calendarRes.ok) {
        const calendarData = await calendarRes.json();
        // The organizer of the event is the meeting owner
        const event = calendarData.items?.find(item =>
          item.hangoutLink?.includes(meetingCode) || item.location?.includes(meetingCode)
        ) || calendarData.items?.[0];

        if (event && event.organizer) {
          return {
            email: event.organizer.email,
            displayName: event.organizer.displayName
          };
        }
      }
    } catch (e) {
      console.error("[Q4Magic] Calendar API error:", e);
    }
    return null;
  }

  /**
   * Helper to resolve email via People API
   */
  async resolveEmailViaPeopleApi(userResourceName, token) {
    try {
      const personId = userResourceName.split('/')[1];
      const personName = `people/${personId}`;
      const res = await fetch(`https://people.googleapis.com/v1/${personName}?personFields=emailAddresses`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const email = data.emailAddresses?.[0]?.value || null;
        return email;
      } else {
        const errorText = await res.text();
        console.warn(`[Q4Magic] People API error ${res.status} for ${personId}:`, errorText);
      }
    } catch (e) {
      console.error("[Q4Magic] People API exception:", e);
    }
    return null;
  }

  /**
   * Fetch participants for a given meeting code
   */
  async fetchParticipants(meetingCode) {
    try {
      const token = await this.getAccessToken();

      // 1. Get Space to find active conference
      const spaceRes = await fetch(`https://meet.googleapis.com/v2/spaces/${meetingCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!spaceRes.ok) return [];
      const spaceData = await spaceRes.json();
      if (!spaceData.activeConference?.conferenceRecord) {
        return [];
      }

      // 2. List participants
      const participantsRes = await fetch(`https://meet.googleapis.com/v2/${spaceData.activeConference.conferenceRecord}/participants`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!participantsRes.ok) {
        if (participantsRes.status === 403) {
          console.warn("[Q4Magic] Meet API: Participant list is restricted for this account type (Personal Gmail). Using UI scraping instead.");
        }
        return [];
      }
      const participantsData = await participantsRes.json();
      const participants = participantsData.participants || [];
      // 3. Identify Owner & Stop Early Once Found
      const me = await this.getCurrentUser(token);
      const owner = await this.fetchMeetingOwner(meetingCode, token);

      const targetEmail = owner?.email?.toLowerCase();

      // Sort participants by start time to find the earliest
      const sortedParticipants = [...participants].sort((a, b) =>
        new Date(a.earliestStartTime) - new Date(b.earliestStartTime)
      );

      const earliest = sortedParticipants[0];
      const results = [];

      for (const p of participants) {
        const participantUserId = p.signedinUser?.user?.split('/')[1];
        let email = null;
        let isOwner = false;

        // 1. Check if this participant is the current auth user (me)
        if (me && participantUserId && (String(participantUserId) === String(me.sub) || String(participantUserId) === String(me.id))) {
          email = me.email;
        }

        // 2. Check if this is the owner from Calendar
        if (targetEmail && !email && p.signedinUser?.user) {
          // Try to resolve email via People API to compare with targetEmail
          email = await this.resolveEmailViaPeopleApi(p.signedinUser.user, token);
          if (email && email.toLowerCase() === targetEmail) {
            isOwner = true;
          }
        }

        // 3. Handle Earliest Joiner as Owner Fallback (for Instant Meetings)
        if (!targetEmail && earliest && p.name === earliest.name) {
          isOwner = true;
          // If we still don't have an email for the owner, try People API
          if (!email && p.signedinUser?.user) {
            email = await this.resolveEmailViaPeopleApi(p.signedinUser.user, token);
          }
          // FINAL FALLBACK: If it's the owner/earliest and we still have no email, 
          // use the current user's email (assuming they are the one hosting/using the tool)
          if (!email && me) {
            email = me.email;
          }
        }

        results.push({ ...p, email, isOwner });
      }
      return results?.filter((row) => row?.isOwner) || [];
    } catch (error) {
      console.error("[Q4Magic] Main fetch error:", error);
      return [];
    }
  }
}

export const googleMeetService = new GoogleMeetService();