package datasource

import (
	"context"
	"fmt"

	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apiserver/pkg/registry/rest"

	datasourceV0 "github.com/grafana/grafana/pkg/apis/datasource/v0alpha1"
	grafanarest "github.com/grafana/grafana/pkg/apiserver/rest"
)

const internalDatasourcesAPIVersion = datasourceV0.GROUP + "/__internal"

type storageWrapper struct {
	grafanarest.Storage

	gv schema.GroupVersion
}

func (s *storageWrapper) toInternal(obj runtime.Object) (runtime.Object, error) {
	ds, ok := obj.(*datasourceV0.DataSource)
	if !ok {
		return nil, fmt.Errorf("datasourceV0.DataSource")
	}
	ds.APIVersion = internalDatasourcesAPIVersion
	ds.Kind = "DataSource"
	if ds.Labels == nil {
		ds.Labels = make(map[string]string)
	}
	ds.Labels["group"] = s.gv.Group
	ds.Labels["apiVersion"] = s.gv.Version
	return ds, nil
}

func (s *storageWrapper) toExternal(obj runtime.Object) (runtime.Object, error) {
	ds, ok := obj.(*datasourceV0.DataSource)
	if !ok {
		return nil, fmt.Errorf("datasourceV0.DataSource")
	}
	if len(ds.Labels) > 0 {
		g := ds.Labels["group"]
		v := ds.Labels["version"]
		if g != "" && v != "" {
			ds.APIVersion = fmt.Sprintf("%s/%s", g, v)
			delete(ds.Labels, "group")
			delete(ds.Labels, "version")
		}
	}
	return ds, nil
}

func (s *storageWrapper) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	obj, err := s.toInternal(obj)
	if err != nil {
		return nil, err
	}
	obj, err = s.Storage.Create(ctx, obj, createValidation, options)
	if err != nil {
		return nil, err
	}
	return s.toExternal(obj)
}

func (s *storageWrapper) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	fmt.Printf("storageWrapper.Update(ctx=%v, name=%q, objInfo=%+v, createValidation=%p, updateValidation=%p, forceAllowCreate=%t, options=%+v)\n", ctx, name, objInfo, createValidation, updateValidation, forceAllowCreate, options)
	return s.Storage.Update(ctx, name, objInfo, createValidation, updateValidation, forceAllowCreate, options)
}

func (s *storageWrapper) Delete(ctx context.Context, name string, deleteValidation rest.ValidateObjectFunc, options *metav1.DeleteOptions) (runtime.Object, bool, error) {
	obj, x, err := s.Storage.Delete(ctx, name, deleteValidation, options)
	if err != nil {
		return nil, x, err
	}
	if obj != nil {
		obj, err = s.toExternal(obj)
	}
	return obj, x, err
}

//------------------------------------------------
// Read Functions: convert the request to generic
//------------------------------------------------

func (s *storageWrapper) Get(ctx context.Context, name string, options *metav1.GetOptions) (runtime.Object, error) {
	fmt.Printf("storageWrapper.Get(ctx=%v, name=%q, options=%+v)\n", ctx, name, options)
	return s.Storage.Get(ctx, name, options)
}

func (s *storageWrapper) List(ctx context.Context, options *metainternalversion.ListOptions) (runtime.Object, error) {
	fmt.Printf("storageWrapper.List(ctx=%v, options=%+v)\n", ctx, options)
	return s.Storage.List(ctx, options)
}
