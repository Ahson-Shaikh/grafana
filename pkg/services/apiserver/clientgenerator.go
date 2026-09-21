package apiserver

import (
	"context"
	"net/http"
	"sync"

	"github.com/grafana/grafana-app-sdk/k8s"
	"github.com/grafana/grafana-app-sdk/resource"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type clientFieldManagerKey struct{}

// WithClientFieldManager sets the Kubernetes field manager for write requests
// made with ctx. The app SDK resource options do not expose FieldManager.
func WithClientFieldManager(ctx context.Context, fieldManager string) context.Context {
	return context.WithValue(ctx, clientFieldManagerKey{}, fieldManager)
}

type clientFieldManagerRoundTripper struct {
	next http.RoundTripper
}

func (t clientFieldManagerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	fieldManager, ok := req.Context().Value(clientFieldManagerKey{}).(string)
	if ok && fieldManager != "" && (req.Method == http.MethodPost || req.Method == http.MethodPut || req.Method == http.MethodPatch) {
		req = req.Clone(req.Context())
		query := req.URL.Query()
		query.Set("fieldManager", fieldManager)
		req.URL.RawQuery = query.Encode()
	}
	return t.next.RoundTrip(req)
}

// ProvideClientGenerator creates a lazy-initialized ClientGenerator.
func ProvideClientGenerator(restConfigProvider RestConfigProvider) resource.ClientGenerator {
	return &lazyClientGenerator{
		restConfigProvider: restConfigProvider,
	}
}

type lazyClientGenerator struct {
	restConfigProvider RestConfigProvider
	clientGenerator    resource.ClientGenerator
	initOnce           sync.Once
	initError          error
}

func (g *lazyClientGenerator) init() error {
	g.initOnce.Do(func() {
		restConfig, err := g.restConfigProvider.GetRestConfig(context.Background())
		if err != nil {
			g.initError = err
			return
		}
		restConfig.APIPath = "apis"
		restConfig.Wrap(func(next http.RoundTripper) http.RoundTripper {
			return clientFieldManagerRoundTripper{next: next}
		})
		g.clientGenerator = k8s.NewClientRegistry(*restConfig, k8s.DefaultClientConfig())
	})
	return g.initError
}

func (g *lazyClientGenerator) ClientFor(kind resource.Kind) (resource.Client, error) {
	if err := g.init(); err != nil {
		return nil, err
	}
	return g.clientGenerator.ClientFor(kind)
}

func (g *lazyClientGenerator) GetCustomRouteClient(gv schema.GroupVersion, plural string) (resource.CustomRouteClient, error) {
	if err := g.init(); err != nil {
		return nil, err
	}
	return g.clientGenerator.GetCustomRouteClient(gv, plural)
}

func (g *lazyClientGenerator) DiscoveryClient() (resource.DiscoveryClient, error) {
	if err := g.init(); err != nil {
		return nil, err
	}
	return g.clientGenerator.DiscoveryClient()
}
