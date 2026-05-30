package option

// MieruPortBinding is the per-port transport binding for the mieru inbound.
// shtorm-7 option/mieru.go has no equivalent (its outbound uses ServerPortRanges
// strings); we define it here for the inbound only.
type MieruPortBinding struct {
	Protocol  string `json:"protocol,omitempty"`
	PortRange string `json:"portRange,omitempty"`
	Port      uint16 `json:"port,omitempty"`
}

// MieruInboundOptions is the server-side configuration for the mieru inbound.
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
