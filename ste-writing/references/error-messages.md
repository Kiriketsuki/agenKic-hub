# Error messages

Profile: `strict`. Sentence cap: 20 words. Apply every rule, no exceptions -- this is
the surface users hit while something is already broken.

## The five-part structure

1. State the limit -- the boundary that exists normally.
2. State what happened -- the specific event that crossed it.
3. State the system's response -- what the system did about it.
4. Point at the data -- the exact field, header, or id to check.
5. Give the action -- what to do next.

Five sentences, five parts, in this order. Do not merge parts 1 and 2 into one
sentence, even though they are related -- the reader needs the limit before the event
makes sense.

## The zero-violation example

This example follows the shape tested in
`../../kilint/reference/before-after-samples.md`:

> The API allows a maximum of 100 requests per minute for each account. Your
> application sent more requests than this limit allows. The server rejected the extra
> requests to protect the system for all users. Check the `Retry-After` header in the
> response for the exact wait time. Wait for this time. Send your request again.

Limit -> what happened -> response -> data -> action. Six sentences, no contractions,
no passive with a hidden actor, no filler.

## Worked example -- authentication failure

> Application access tokens expire 15 minutes after the authentication service issues
> them. This request used a token that expired 3 minutes ago. The server rejected the
> request and did not process the fleet update. Check the `exp` field in the token
> payload against the current server time. Refresh the token. Send the request again.

## Worked example -- validation failure

> A vehicle ID must be exactly 8 characters, letters and digits only. The submitted
> vehicle ID `AV12` has 4 characters. The server rejected the record and did not add it
> to the fleet. Check the `vehicleId` field in the request body. Correct the vehicle ID
> and resubmit the request.

## Worked example -- timeout

> The telemetry ingester waits 5 seconds for a response from the GPS module. The GPS
> module did not respond within this time. The ingester marked this reading as missed
> and moved to the next vehicle. Check the `lastSeen` timestamp for this vehicle in the
> fleet dashboard. Restart the GPS module on that vehicle if readings keep timing out.

## Common failures to check for

- A limit stated only implicitly ("too many requests" without saying the number).
- What-happened and response merged into one sentence with "so" or "which caused".
- No pointer to actual data -- "check your request" instead of naming a field or
  header.
- An action that is not actionable: "please try again later" instead of "wait 60
  seconds, then send your request again".
