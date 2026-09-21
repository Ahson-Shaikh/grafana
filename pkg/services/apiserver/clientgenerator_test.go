package apiserver

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestClientFieldManagerRoundTripper(t *testing.T) {
	var gotFieldManager string
	next := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		gotFieldManager = req.URL.Query().Get("fieldManager")
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	})
	transport := clientFieldManagerRoundTripper{next: next}
	req, err := http.NewRequestWithContext(WithClientFieldManager(context.Background(), "plugins.installsync"), http.MethodPut, "http://example.com", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, resp.Body.Close())
	})
	require.Equal(t, "plugins.installsync", gotFieldManager)
	require.Empty(t, req.URL.Query().Get("fieldManager"), "the shared request must not be mutated")
}
