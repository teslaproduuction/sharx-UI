package option

// MieruInboundOptions is the server-side configuration for the mieru inbound.
// Grafted from hiddify/hiddify-sing-box; depends on MieruPortBinding already
// present in shtorm-7/sing-box-extended option/mieru.go.
type MieruInboundOptions struct {
	ListenOptions
	Users        []MieruUser        `json:"users,omitempty"`
	PortBindings []MieruPortBinding `json:"portBindings,omitempty"`
	Network      NetworkList        `json:"network,omitempty"`
}

// MieruUser is one user entry in a mieru server config.
// Field tag "username" matches the SharX builder output (buildMieruInboundJSON).
type MieruUser struct {
	Name     string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}
