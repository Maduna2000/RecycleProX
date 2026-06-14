# Scale Station Testing Guide

## Test Scenarios

### 1. New Casual Customer (First Time)
1. Go to Scale Station app
2. Select "Walk-in / Casual"
3. **Verify**: National ID field is now FIRST field
4. Enter a NEW 13-digit National ID (e.g., `1234567890123`)
5. **Verify**: No auto-population (new customer)
6. Fill in: First Name, Last Name, Phone, Address
7. Click Continue
8. Complete the scale order process
9. **Verify**:
   - Order created successfully
   - Go to Casuals module → Customer should appear in the list

### 2. Returning Casual Customer (Auto-Populate)
1. Go to Scale Station app
2. Select "Walk-in / Casual"
3. Enter the SAME 13-digit National ID from Test 1
4. **Verify**:
   - "Customer found" message appears with green checkmark
   - First Name, Last Name, Phone, Address all auto-filled
   - Fields are still EDITABLE
5. Try editing the phone number
6. Complete the scale order
7. **Verify**:
   - Order created
   - Customer record updated in Casuals module with new phone

### 3. Blacklisted Customer (Should Block)
**Setup**: First blacklist a customer
1. Go to Casuals module
2. Find a customer and blacklist them (add reason)

**Test**:
1. Go to Scale Station app
2. Select "Walk-in / Casual"
3. Enter the blacklisted customer's National ID
4. **Verify**:
   - Red error message appears with blacklist reason
   - Continue button is DISABLED
   - Cannot proceed with transaction

### 4. Validation Testing
**Test A - Missing National ID**:
1. Select "Walk-in / Casual"
2. Leave National ID empty
3. Fill other fields and try to Continue
4. **Verify**: Error message "Required" appears

**Test B - Invalid National ID (less than 13 digits)**:
1. Enter only 12 digits in National ID field
2. **Verify**: Error message "Must be exactly 13 digits" appears

**Test C - Invalid National ID (letters)**:
1. Enter "123456789abcd" in National ID field
2. **Verify**: Error message "Must be exactly 13 digits" appears

### 5. Field Order Verification
1. Open Scale Station → Walk-in / Casual
2. **Verify** field order is:
   1. National ID / Passport * (FIRST)
   2. First Name *
   3. Last Name *
   4. Phone Number *
   5. Address (last)

### 6. Placeholder Text Verification
1. Open Scale Station → Walk-in / Casual
2. **Verify** placeholders:
   - National ID: "1234567890123" (NO "optional" text)
   - Address: "Physical address" (NO "Optional" text)

### 7. Offline Mode (if applicable)
1. Disconnect internet/go offline
2. Create scale order with casual customer
3. **Verify**:
   - Order saved locally
   - Customer saved locally
4. Reconnect internet
5. **Verify**: Data syncs to server

### 8. Account Customer (Should Still Work)
1. Select "Account Customer"
2. Search for existing account
3. **Verify**: Account lookup still works normally

## Expected Behavior Summary

✅ **National ID is REQUIRED** for casual customers
✅ **Auto-lookup triggers** when 13 digits are entered
✅ **Blacklisted customers are BLOCKED** from creating orders
✅ **Auto-filled fields remain EDITABLE**
✅ **Customer data is SAVED** to Casuals module
✅ **Future transactions AUTO-POPULATE** from saved data
✅ **No "optional" text** in placeholders
✅ **Proper validation error messages** displayed

## Common Issues & Solutions

### Issue: Auto-lookup not working
- **Check**: National ID must be exactly 13 digits
- **Check**: API endpoint `/api/customers/lookup` is accessible
- **Check**: Network connectivity

### Issue: Customer not appearing in Casuals module
- **Check**: National ID was provided (required)
- **Check**: Order was completed successfully
- **Check**: Refresh the Casuals page

### Issue: Blacklist check not working
- **Check**: Customer is actually blacklisted in database
- **Check**: `blacklisted` field is set to `true` in Customer table

## Database Verification (for developers)

```sql
-- Check if casual customer was saved
SELECT id, firstName, lastName, idNumber, phone, physicalAddress, customerType
FROM "Customer"
WHERE idNumber = '1234567890123';

-- Check if customer is linked to scale order
SELECT so.orderNumber, so.customerId, c.firstName, c.lastName
FROM "ScaleOrder" so
LEFT JOIN "Customer" c ON so.customerId = c.id
WHERE so.orderNumber = 'SCL-XXXXXXXX-XXXX';
```

## Rollback Instructions (if needed)

If issues arise, you can rollback by:
1. Stop the development server
2. Run: `git checkout HEAD -- src/app/scale/components/Step1Customer.tsx src/lib/schemas/scale.ts src/lib/services/scaleService.ts src/app/scale/components/Step5Review.tsx`
3. Restart the server

## Support

If you encounter any issues during testing, check:
1. Browser console for JavaScript errors
2. Network tab for failed API calls
3. Server logs for backend errors
