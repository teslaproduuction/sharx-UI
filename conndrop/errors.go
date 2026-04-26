package conndrop

import "errors"

// ErrConntrackUnavailable is returned when conntrack is missing or the OS is not Linux.
var ErrConntrackUnavailable = errors.New("conntrack not available (need Linux + conntrack-tools, CAP_NET_ADMIN for drop)")
