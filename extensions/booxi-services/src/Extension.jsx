import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState(null);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [completedBookings, setCompletedBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    let usedBackendUrlSetting = false;
    try {
      setLoading(true);
      setError(null);

      // 1. Get customer email from Customer Account API
      const customerRes = await fetch(
        'shopify://customer-account/api/unstable/graphql.json',
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            query: 'query { customer { emailAddress { emailAddress } } }',
          }),
        }
      );
      const customerData = await customerRes.json();

      // Check for GraphQL errors (e.g. app not approved for protected customer data)
      const apiErrors = customerData?.errors;
      if (apiErrors?.length) {
        const msg = apiErrors[0]?.message || 'API error';
        setError(
          msg.includes('not approved') || msg.includes('protected')
            ? 'Email access requires Protected Customer Data approval. Go to Partner Dashboard > Your app > Settings > Protected customer data, and select the email field for development.'
            : msg
        );
        setLoading(false);
        return;
      }

      const customerEmail =
        customerData?.data?.customer?.emailAddress?.emailAddress;
      if (!customerEmail) {
        setError(
          'Could not load customer email. Enable it in Partner Dashboard: Apps > booxi-services-app > Settings > Protected customer data > select email for development.'
        );
        setLoading(false);
        return;
      }
      setEmail(customerEmail);

      // 2. Resolve API base URL: use backend_url setting (direct, CORS works) or store URL (app proxy, may have CORS issues)
      const backendUrl = (shopify?.settings?.value?.backend_url ?? '').toString().trim();
      const shopData = await shopify.query('query { shop { primaryDomain { url } } }');
      const storeUrl = (shopData?.data?.shop?.primaryDomain?.url || '').replace(/\/$/, '');
      const apiBase = backendUrl || storeUrl;
      usedBackendUrlSetting = !!backendUrl;
      if (!apiBase) {
        setError('Could not load store URL. Set "Booxi API backend URL" in extension settings for best results.');
        setLoading(false);
        return;
      }

      // 3. Fetch client ID (must use absolute URL - relative URLs fail in web worker)
      const clientRes = await fetch(
        `${apiBase}/apps/booxi/client?email=${encodeURIComponent(customerEmail)}`,
        { mode: 'cors', credentials: 'omit' }
      );
      const clientJson = await clientRes.json();
      const id = clientJson?.clientId ?? clientJson?.clients?.[0]?.id;
      if (!id) {
        setClientId(null);
        setUpcomingBookings([]);
        setCompletedBookings([]);
        setLoading(false);
        return;
      }
      setClientId(id);

      // 4. Fetch bookings - Upcoming (today to +1 year) and Completed (-1 year to today)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneYearLater = new Date(today);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const toRfc3339 = (d) => d.toISOString();

      const [upcomingRes, completedRes] = await Promise.all([
        fetch(
          `${apiBase}/apps/booxi/bookings?clientId=${id}&from=${toRfc3339(today)}&to=${toRfc3339(oneYearLater)}`,
          { mode: 'cors', credentials: 'omit' }
        ),
        fetch(
          `${apiBase}/apps/booxi/bookings?clientId=${id}&from=${toRfc3339(oneYearAgo)}&to=${toRfc3339(today)}`,
          { mode: 'cors', credentials: 'omit' }
        ),
      ]);

      const upcomingJson = await upcomingRes.json();
      const completedJson = await completedRes.json();

      const upcoming = upcomingJson?.bookings ?? [];
      const completed = (completedJson?.bookings ?? []).filter(
        (b) => b.isCompleted === true
      );

      setUpcomingBookings(upcoming);
      setCompletedBookings(completed);
    } catch (err) {
      const msg = err?.message ?? 'Failed to load bookings';
      const isCorsOrFetch = /CORS|Failed to fetch|Failed to parse URL/i.test(msg);
      setError(
        isCorsOrFetch && !usedBackendUrlSetting
          ? `${msg}. Fix: Set "Booxi API backend URL" in Content → Customer accounts → Customize → extension settings (use App URL from shopify app dev terminal).`
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  const bookings = activeTab === 'upcoming' ? upcomingBookings : completedBookings;

  const brandName = (shopify?.settings?.value?.brand_name ?? 'Rennai').toString().trim();

  return (
    <s-page heading="Services">
      <s-section heading="Booxi Service Bookings" accessibilityLabel="Booxi bookings">
        {/* Pill-shaped tab buttons */}
        <s-box padding="base">
          <s-stack direction="inline" gap="small">
            <s-button
              variant={activeTab === 'upcoming' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming
            </s-button>
            <s-button
              variant={activeTab === 'completed' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('completed')}
            >
              Completed
            </s-button>
          </s-stack>
        </s-box>

        {loading && (
          <s-box padding="base">
            <s-text>Loading...</s-text>
          </s-box>
        )}

        {error && (
          <s-box padding="base">
            <s-text tone="critical">{error}</s-text>
          </s-box>
        )}

        {!loading && !error && clientId === null && (
          <s-box padding="base">
            <s-text color="subdued">
              No Booxi client found for your account. Book a service to see your
              appointments here.
            </s-text>
          </s-box>
        )}

        {!loading && !error && clientId !== null && bookings.length === 0 && (
          <s-box padding="base">
            <s-text color="subdued">
              No {activeTab} bookings.
            </s-text>
          </s-box>
        )}

        {!loading && !error && bookings.length > 0 && (
          <s-stack direction="block" gap="base">
            {bookings.map((booking) => (
              <BookingCard
                key={booking.bookingId}
                booking={booking}
                isUpcoming={activeTab === 'upcoming'}
                brandName={brandName}
              />
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

function BookingCard({booking, isUpcoming, brandName}) {
  const serviceName =
    booking?.items?.[0]?.serviceName ?? 'Service';
  const startTime =
    booking?.totalClientTimespan?.start ??
    booking?.startsOn ??
    '';
  const staffName = [booking?.staffFirstName, booking?.staffLastName]
    .filter(Boolean)
    .join(' ') || 'Rennai Team';

  // Format date as "February, 27 - 11:45"
  const formattedDate = startTime
    ? (() => {
        const d = new Date(startTime);
        const month = d.toLocaleString(undefined, {month: 'long'});
        const day = d.getDate();
        const time = d.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        return `${month}, ${day} - ${time}`;
      })()
    : '';

  const isCancelled =
    booking?.isCancelled === true ||
    (typeof booking?.status === 'string' &&
      booking.status.toLowerCase().includes('cancel'));

  const handleBookAgain = () => {
    if (isUpcoming) {
      shopify.toast?.show?.('Cancel requested');
    } else {
      shopify.toast?.show?.('Book Again');
    }
  };

  return (
    <s-box
      padding="base"
      background="base"
      borderRadius="base"
      border="base"
    >
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="stretch">
        {/* Left column: booking details */}
        <s-box padding="base">
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small">
              <s-heading>{serviceName}</s-heading>
              {isCancelled && (
                <s-badge tone="critical">Cancelled</s-badge>
              )}
            </s-stack>
            {formattedDate && (
              <s-text color="subdued">{formattedDate}</s-text>
            )}
            {staffName && (
              <s-stack direction="block" gap="none">
                <s-text color="subdued" type="small">Staff</s-text>
                <s-text>{staffName}</s-text>
              </s-stack>
            )}
            <s-button
              variant="secondary"
              onClick={handleBookAgain}
            >
              {isUpcoming ? 'Cancel' : 'Book Again'}
            </s-button>
          </s-stack>
        </s-box>
        {/* Right column: branding */}
        {brandName && (
          <s-box
            padding="large"
            background="subdued"
            borderRadius="base"
            minInlineSize="120px"
          >
            <s-stack direction="block" gap="none" alignItems="center" justifyContent="center">
              <s-heading>{brandName}</s-heading>
            </s-stack>
          </s-box>
        )}
      </s-grid>
    </s-box>
  );
}
