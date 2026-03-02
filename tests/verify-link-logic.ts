import { emailTemplates } from '../src/lib/email';
import { generateOperatorViewToken, generateUserTripToken } from '../src/lib/tokens';

const mockRequestId = 'req_id_123';
const mockUserId = 'user_id_456';
const mockOperatorId = 'op_id_789';
const mockAppBaseUrl = 'https://businto.com';

async function verifyLinks() {
    console.log('🚀 Starting Link Verification Script...\n');

    // 1. User Request Confirmation Link
    const userToken = await generateUserTripToken(mockRequestId, mockUserId);
    const requestConfirmation = emailTemplates.requestConfirmation({
        userName: 'Test User',
        serviceType: 'school',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Elm St',
        date: '2026-03-01',
        requestId: mockRequestId,
        accessToken: userToken,
        appBaseUrl: mockAppBaseUrl
    });
    const expectedRequestLink = `${mockAppBaseUrl}/trips/${mockRequestId}?token=${userToken}`;
    const requestConfirmed = requestConfirmation.html.includes(expectedRequestLink);
    console.log(`[Request Confirmation] Link valid: ${requestConfirmed ? '✅' : '❌'}`);
    if (!requestConfirmed) console.log(`Expected: ${expectedRequestLink} but not found in HTML.`);

    // 2. Operator New Request Link
    const opToken = await generateOperatorViewToken(mockRequestId, mockOperatorId, 'quote', 7);
    const operatorNewRequest = emailTemplates.operatorNewRequest({
        operatorName: 'Test Operator',
        serviceType: 'school',
        serviceTypeDisplay: 'School Bus',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Elm St',
        pickupFuzzy: 'Cambridge, MA',
        dropoffFuzzy: 'Boston, MA',
        date: '2026-03-01',
        requirements: ['WiFi'],
        requestId: mockRequestId,
        accessToken: opToken,
        appBaseUrl: mockAppBaseUrl
    });
    const expectedOpLink = `${mockAppBaseUrl}/quotes/submit?request_id=${mockRequestId}&token=${opToken}`;
    const opConfirmed = operatorNewRequest.html.includes(expectedOpLink);
    console.log(`[Operator New Request] Link valid: ${opConfirmed ? '✅' : '❌'}`);

    // 3. Quote Received Link
    const quoteReceived = emailTemplates.quoteReceived({
        userName: 'Test User',
        operatorName: 'Test Op',
        price: 150,
        vehicleType: 'Van',
        requestId: mockRequestId,
        quoteId: 'q-1',
        accessToken: userToken,
        appBaseUrl: mockAppBaseUrl
    });
    const expectedQuoteLink = `${mockAppBaseUrl}/trips/${mockRequestId}?token=${userToken}`;
    const quoteConfirmed = quoteReceived.html.includes(expectedQuoteLink);
    console.log(`[Quote Received] Link valid: ${quoteConfirmed ? '✅' : '❌'}`);

    // 4. Booking Confirmation Link
    const bookingConfirmation = emailTemplates.bookingConfirmation({
        userName: 'Test User',
        confirmationCode: 'B-123456',
        operatorName: 'Test Op',
        vehicleType: 'Van',
        pickupAddress: '123 St',
        dropoffAddress: '456 St',
        date: '2026-03-01',
        amount: 150,
        appBaseUrl: mockAppBaseUrl
    });
    const expectedBookingLink = `${mockAppBaseUrl}/dashboard/bookings`;
    const bookingConfirmed = bookingConfirmation.html.includes(expectedBookingLink);
    console.log(`[Booking Confirmation] Link valid: ${bookingConfirmed ? '✅' : '❌'}`);

    // 5. Operator Order Details Link (PII REVEAL)
    const operatorOrderDetails = emailTemplates.operatorOrderDetails({
        operatorName: 'Test Op',
        parentName: 'Parent',
        parentEmail: 'parent@example.com',
        parentPhone: '555-0199',
        quoteAmount: 150,
        pickup: '123 St',
        dropoff: '456 St',
        date: '2026-03-01',
        vehicleType: 'Van',
        confirmationCode: 'B-123456',
        bookingId: 'book-123',
        appBaseUrl: mockAppBaseUrl
    });
    const expectedOrderLink = `${mockAppBaseUrl}/dashboard/bookings`;
    const orderConfirmed = operatorOrderDetails.html.includes(expectedOrderLink);
    console.log(`[Operator Order Details (PII)] Link valid: ${orderConfirmed ? '✅' : '❌'}`);

    console.log('\n✅ Link Verification Complete.');
}

verifyLinks().catch(console.error);
