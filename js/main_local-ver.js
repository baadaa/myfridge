$(document).ready(function() {

  var Utils = {
    getOrientation: function(file, callback) {
      var reader = new FileReader();

      reader.onload = function(event) {
        var view = new DataView(event.target.result);

        if (view.getUint16(0, false) != 0xFFD8) return callback(-2);

        var length = view.byteLength,
            offset = 2;

        while (offset < length) {
          var marker = view.getUint16(offset, false);
          offset += 2;

          if (marker == 0xFFE1) {
            if (view.getUint32(offset += 2, false) != 0x45786966) {
              return callback(-1);
            }
            var little = view.getUint16(offset += 6, false) == 0x4949;
            offset += view.getUint32(offset + 4, little);
            var tags = view.getUint16(offset, little);
            offset += 2;

            for (var i = 0; i < tags; i++)
              if (view.getUint16(offset + (i * 12), little) == 0x0112)
                return callback(view.getUint16(offset + (i * 12) + 8, little));
          }
          else if ((marker & 0xFF00) != 0xFF00) break;
          else offset += view.getUint16(offset, false);
        }
        return callback(-1);
      };

      reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
    },
    resetOrientation: function(srcBase64, srcOrientation, callback) {
      var img = new Image();

      img.onload = function() {
        var width = img.width,
            height = img.height,
            max_size = 544,
            canvas = document.createElement('canvas'),
            ctx = canvas.getContext("2d");

        // resize the image
        if (width > height) {
            if (width > max_size) {
                height *= max_size / width;
                width = max_size;
            }
        } else {
            if (height > max_size) {
                width *= max_size / height;
                height = max_size;
            }
        }
        canvas.width = width;
        canvas.height = height;

        // set proper canvas dimensions before transform & export
        if ([5,6,7,8].indexOf(srcOrientation) > -1) {
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }


        // transform context before drawing image
        switch (srcOrientation) {
          case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
          case 3: ctx.transform(-1, 0, 0, -1, width, height ); break;
          case 4: ctx.transform(1, 0, 0, -1, 0, height ); break;
          case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
          case 6: ctx.transform(0, 1, -1, 0, height , 0); break;
          case 7: ctx.transform(0, -1, -1, 0, height , width); break;
          case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
          default: ctx.transform(1, 0, 0, 1, 0, 0);
        }

        // draw image
        ctx.drawImage(img, 0, 0, width, height);

        // export base64
        callback(canvas.toDataURL('image/jpeg', 0.5));
      };

      img.src = srcBase64;
    },
    itemMarkup: function(photo, name, quantity, addDate, expDate) {
      if (!photo) {
        photo = "../img/food.svg";
      }
      var str1 =
      '<section class="food-item">' +
        '<section class="item-img" style="background-image: url(' + photo + ');">' +
        '</section>' +
        '<section class="item-desc">' +
          '<span class="item-name">' + name + '</span>';
      var str2 = (quantity === "" || quantity === undefined) ? "" :
          '<span class="item-quantity">' + quantity + '</span>';
      var str3 =
          '<span class="added-date">Added at ' + addDate + '</span>';
      var str4 = (expDate === "" || expDate === undefined ) ? "" :
          '<span class="exp-date">Expires at '+ expDate + '</span>';
      var str5 =
        '</section>' +
      '</section>';
      return str1 + str2 + str3 + str4 + str5;
    }
  };

  var FridgeApp = {
    Items: {
      fridge: [
        // {
        //   name: "Banana",
        //   img: "img/banana.jpg",
        //   qty: "5 pcs",
        //   added: "Feb 15, 2017",
        //   exp: "Feb 22, 2017"
        // }
        // {
        //   name: "사과",
        //   img: "img/apple.jpg",
        //   qty: "5개",
        //   added: "Feb 15, 2017",
        //   exp: "Feb 22, 2017"
        // },
        // {
        //   name: "Test",
        //   added: "Feb 15, 2017",
        // }
      ],
      freezer: [
        // {
        //   name: "Ice Cream",
        //   img: "img/ice-cream.jpg",
        //   qty: "1 carton",
        //   added: "Feb 15, 2017",
        //   exp: "Feb 22, 2017"
        // }
        // {
        //   name: "고춧가루",
        //   img: "img/red-pepper.jpg",
        //   qty: "1봉지",
        //   added: "Feb 15, 2017",
        //   exp: "Feb 22, 2017"
        // }
      ]
    },
    UI: {
      currentView: "listView",
      currentArea: "fridge",
      slideOpen: false,
      today: new Date(),
      takePicture: document.querySelector('input[name="i-image"]'),
      photo: '',
      calendar: ''
    },
    init: function() {
      $('.overlay').hide();
      // $('input[name="i-date"]').attr('placeholder', this.UI.today);
      // TODO: add today's date as placeholder
      this.bindEvents();
      // $('.todo-panel').hide();
      // this.removeItemList(this.UI.currentArea);
      this.render();
      // this.renderItemList(this.UI.currentArea);

    },
    bindEvents: function() {
      $('ul.nav-items').on('touch click', 'li', this.toggleNav.bind(this));
      $('.add-item').on('touch click', this.addItem.bind(this));
      $('#add-btn').on('touch click', this.registerNew.bind(this));
      $('.todo-btn').on('touch click', this.openTodo.bind(this));
      $('#cancel-btn').on('touch click', this.cancelOverlay.bind(this));
      this.UI.calendar = new flatpickr('input[name="i-date"], input[name="i-exp"]', {
        altInput: true,
      	altFormat: "M j, Y",
        dateFormat: "M j, Y"
      });
      this.UI.takePicture.onchange = this.takePhoto.bind(this);
      userFridge.on('value', this.render.bind(this));
    },
    renderItemList: function(area) {
      // this.removeItemList(area);
      this.Items[area].forEach(function(item){
        var itemStr = Utils.itemMarkup(item.img, item.name, item.qty, item.added, item.exp);
        $('section.item-list').append(itemStr);
      });
    },
    removeItemList: function() {
      $('section.item-list').find('*').not('div, img').remove();
    },
    toggleNav: function(e) {
      var clickedNav = $(e.target);
      var targetArea = $(clickedNav).html().toLowerCase();
      $(clickedNav).addClass('selected');
      $('ul.nav-items li').not(clickedNav).removeClass('selected');

      if (this.UI.currentArea === targetArea) {
        return;
      } else {
        this.removeItemList(this.UI.currentArea);
        this.UI.currentArea = targetArea;
        this.renderItemList(targetArea);
        switch (this.UI.currentArea) {
          case "fridge":
            $('body').css('background-image', 'url("../img/pat.png")').fadeIn(3000);
            // $('body').animate({ backgroundImage: 'url("../img/pat.png")'}, 1000, function(){});
            break;
          case "freezer":
          $('body').css('background-image', 'url("../img/pat-2.png")').fadeIn(3000);
            break;
          default:
            break;
        }
      }
    },
    addItem: function() {
      this.changeView('addItem');
    },
    checkEscape: function(e) {
      if (e.which === 27) {
        // TODO: Check if any calendar is open. If so, close calendar but not the overlay
        if (this.UI.currentView !== 'listView') {
          this.changeView('listView');
        }
      }
    },
    render: function(response) {
      var responseVal = response.val();
      var rIdentifiers = _.keys(responseVal);

      var uItems = _.map(rIdentifiers, function(id) {
        var iObj = responseVal[id];
        return {
          id: id,
          name: iObj.name,
          img: iObj.img,
          qty: iObj.qty,
          added: iObj.added,
          exp: iObj.exp
        };
      });

      var itemStr = "";
      uItems.forEach(function(item) {
        itemStr += Utils.itemMarkup(item.img, item.name, item.qty, item.added, item.exp);

      });
      $('section.item-list').not('div, img').html(itemStr);
      // this.Items[area].forEach(function(item){
      //   var itemStr = Utils.itemMarkup(item.img, item.name, item.qty, item.added, item.exp);
      //   $('section.item-list').append(itemStr);
      // });

    },
    takePhoto: function(e) {
      var _this = this,
          files = e.target.files,
          imgTag = $('label.photo-file img'),
          imgBox = $('div.photo'),
          imgUrl;
      if (files && files.length > 0) {
          this.UI.photo = files[0];
      }
      imgUrl = window.URL.createObjectURL(this.UI.photo);

      Utils.getOrientation(this.UI.photo, function(orientation) {
        Utils.resetOrientation(imgUrl, orientation, function(resetBase64Image) {
          $(imgBox).css('background-image', 'url("' + resetBase64Image + '")')
          .css('background-size', 'cover');
          _this.UI.photo = resetBase64Image;
        });
      });
    },
    changeView: function(viewType) {

      if (this.UI.slideOpen) {
        this.hidePanel();
      }

      switch (viewType) {
        case "addItem":
          $('.overlay').css('opacity', '1')
          .fadeIn('400');
          this.UI.currentView = "addItem";
          $('body').addClass('noscroll');
          break;
        case "editItem":
          $('.overlay').css('opacity', '1')
          .fadeIn('400');
          this.UI.currentView = "editItem";
          $('body').addClass('noscroll');
          break;
        case "listView":
          $('.overlay').fadeOut('400');
          this.UI.currentView = "listView";
          this.resetInputFields();
          $('body').removeClass('noscroll');
          break;
        default:
          break;
      }
    },
    registerNew: function() {
      var newItemPhoto = this.UI.photo || "../img/food.svg";
      var newItemName = $('input[name="i-name"]').val();
      var newItemQuantity = $('input[name="i-quantity"]').val();
      var newItemDate = $('input[name="i-date"]').val();
      var newItemExpDate = $('input[name="i-exp"]').val();

      if (this.requiredFieldsComplete(newItemName, newItemQuantity, newItemDate)) {
        var htmlString = Utils.itemMarkup(newItemPhoto, newItemName, newItemQuantity, newItemDate, newItemExpDate);
        $('section.item-list').append(htmlString);

        var newTodo = {
          name: newItemName,
          img: newItemPhoto,
          qty: newItemQuantity,
          added: newItemDate,
          exp: newItemExpDate
        };
        // this.Items[this.UI.currentArea].push(newTodo);
        switch (this.UI.currentArea) {
          case ('fridge'):
            userFridge.push(newTodo);
            break;
          case ('freezer'):
            userFreezer.push(newTodo);
            break;
        }
        this.changeView('listView');
        this.resetInputFields();
      } else {
        $('.msg').show();
        // TODO: highlight incomplete fields
      }
    },
    requiredFieldsComplete: function(name, qty, date) {
      if ((name === '') || (date === "")) {
        return false;
      } else {
        return true;
      }
    },
    cancelOverlay: function() {
      this.changeView('listView');
      this.resetInputFields();
    },
    resetInputFields: function() {
      $('div.photo').css('background-image', 'url("../img/add-photo.svg")')
      .css('background-size', 'inherit');
      $('input[name="i-name"]').val('');
      $('input[name="i-quantity"]').val('');
      $('input[name="i-date"]').val('');
      $('input[name="i-exp"]').val('');
      this.UI.calendar[0].clear(); // added date
      this.UI.calendar[1].clear(); // expiration date
      $('.msg').hide();
      this.UI.photo = '';
    },
    showPanel: function() {
      // $('.todo-panel').show('slide', 200);
      $('.todo-panel').animate({
        left: "+=92vw"
      }, 300, function(){});

      this.UI.slideOpen = true;
    },
    hidePanel: function() {
      // $('.todo-panel').hide('slide', 200);
      $('.todo-panel').animate({
        left: "-=92vw"
      }, 300, function(){});

      this.UI.slideOpen = false;
    },
    openTodo: function() {
      if (this.UI.slideOpen) {
        this.hidePanel();
        $('body').removeClass('noscroll');
      } else {
        this.showPanel();
        $('body').addClass('noscroll');
      }
    }
  };

  var TodoApp = {
    // NOTE:
    // Place shopping list functions here
    init: function() {

    }
  };
  FridgeApp.init();
  TodoApp.init();
});
