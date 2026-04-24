package controller

import "github.com/konstpic/sharx-code/v2/xray"

// subscriptionSubsHook supplies subscription link lines for the public subscription page API (registered from main to avoid import cycles with sub).
var subscriptionSubsHook func(subID, host string) ([]string, int64, xray.ClientTraffic, error)

// RegisterSubscriptionSubsHook registers the hook used by GET /panel/api/public/subscription. Call from main after DB init.
func RegisterSubscriptionSubsHook(fn func(subID, host string) ([]string, int64, xray.ClientTraffic, error)) {
	subscriptionSubsHook = fn
}
